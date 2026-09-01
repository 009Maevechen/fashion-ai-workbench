import test from "node:test";
import assert from "node:assert/strict";
import { acquireProviderSlot } from "../src/lib/provider-concurrency";

test("Provider 并发信号量：并发上限 3 时最多 3 个同时运行", async () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 6 }, (_, index) => async () => {
    const release = await acquireProviderSlot(key, 3);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    release();
    return index;
  });
  const results = await Promise.all(tasks.map((task) => task()));
  assert.equal(results.length, 6);
  assert.ok(peak <= 3, `并发峰值应为 3，实际 ${peak}`);
  assert.ok(peak >= 2, `应存在并行，实际峰值 ${peak}`);
});

test("Provider 并发信号量：同一 Provider 串行排队，释放后继续", async () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  let active = 0;
  let peak = 0;
  const order: number[] = [];
  const tasks = Array.from({ length: 4 }, (_, index) => async () => {
    const release = await acquireProviderSlot(key, 1);
    active += 1;
    peak = Math.max(peak, active);
    order.push(index);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    release();
    return index;
  });
  await Promise.all(tasks.map((task) => task()));
  assert.equal(peak, 1, `并发上限为 1 时峰值应为 1，实际 ${peak}`);
  assert.equal(order.length, 4);
});
