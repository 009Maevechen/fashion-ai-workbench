import "server-only";

export async function runTryOnVisionAnalysis<T>(work: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      // vision-chat 的传输层已经会重试 3 次；不要再把同一次网络故障
      // 外层重复成最多 6 次。这里只为明确的服务端 5xx 补一次业务重试。
      if (!/HTTP 5\d\d/i.test(message) || attempt === 1)
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  throw lastError;
}
