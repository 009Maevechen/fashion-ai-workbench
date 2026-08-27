import "server-only";

type ConcurrencyState = {
  max: number;
  running: number;
  queue: Array<() => void>;
};

const state = new Map<string, ConcurrencyState>();
type GlobalRuntime = typeof globalThis & { __workbenchProviderSemaphore?: Map<string, ConcurrencyState> };
const globalState = (globalThis as GlobalRuntime).__workbenchProviderSemaphore ?? new Map<string, ConcurrencyState>();
(globalThis as GlobalRuntime).__workbenchProviderSemaphore = globalState;

function slot(key: string, max: number): ConcurrencyState {
  const existing = globalState.get(key);
  if (existing) return existing;
  const created: ConcurrencyState = { max, running: 0, queue: [] };
  globalState.set(key, created);
  return created;
}

/**
 * Provider 级并发信号量：限制同一 Provider 同时进行的生成任务数。
 * 429 / rate limit / provider busy 时调用方应等待重试，而不是疯狂重发。
 */
export async function acquireProviderSlot(key: string, max = 2): Promise<() => void> {
  const s = slot(key, max);
  if (s.running < s.max) {
    s.running += 1;
    return () => {
      s.running = Math.max(0, s.running - 1);
      const next = s.queue.shift();
      if (next) next();
    };
  }
  await new Promise<void>((resolve) => s.queue.push(resolve));
  s.running += 1;
  return () => {
    s.running = Math.max(0, s.running - 1);
    const next = s.queue.shift();
    if (next) next();
  };
}

export function providerConcurrencyState(key: string, max = 2): { maxConcurrency: number; runningTasks: number; queuedTasks: number } {
  const s = slot(key, max);
  return { maxConcurrency: s.max, runningTasks: s.running, queuedTasks: s.queue.length };
}

void state;
