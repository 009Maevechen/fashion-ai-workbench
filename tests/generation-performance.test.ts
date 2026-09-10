import test from "node:test";
import assert from "node:assert/strict";
import { generationProviderConcurrency } from "../src/lib/generation-performance";

test("SYC 中转站保持单并发，避免 499 和账号池拥塞", () => {
  assert.equal(generationProviderConcurrency("syc-openai-compatible", "fast"), 1);
  assert.equal(generationProviderConcurrency("syc-openai-compatible", "quality"), 1);
});

test("直连服务的三姿势和复色可以受控并行", () => {
  assert.equal(generationProviderConcurrency("openai-compatible", "fast"), 3);
  assert.equal(generationProviderConcurrency("openai-compatible", "standard"), 2);
  assert.equal(generationProviderConcurrency("volcengine", "quality"), 2);
  assert.equal(generationProviderConcurrency("fashn", "fast"), 2);
});
