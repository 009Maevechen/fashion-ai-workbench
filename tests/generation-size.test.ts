import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveSizeTier,
  computeTargetSize,
  checkOutputDimensions,
  MAX_GENERATION_EDGE,
  SIZE_ALIGNMENT,
} from "../src/lib/generation-size";

test("生成模式映射到 1K/2K/4K 档位", () => {
  assert.equal(resolveSizeTier("fast"), "1K");
  assert.equal(resolveSizeTier("standard"), "2K");
  assert.equal(resolveSizeTier("quality"), "4K");
});

test("按基准图比例计算目标尺寸并 16 像素对齐", () => {
  const size = computeTargetSize(564, 1180, "2K");
  assert.equal(size.width % SIZE_ALIGNMENT, 0);
  assert.equal(size.height % SIZE_ALIGNMENT, 0);
  assert.equal(size.height, 2048);
  assert.ok(size.width < size.height);
});

test("目标尺寸长边不超过 3840", () => {
  const size = computeTargetSize(1200, 1600, "4K");
  assert.ok(Math.max(size.width, size.height) <= MAX_GENERATION_EDGE);
  assert.equal(size.height, 3840);
});

test("极端宽高比被限制在 3:1 以内", () => {
  const size = computeTargetSize(4000, 1000, "2K");
  assert.equal(size.width, 2048);
  assert.ok(size.width / size.height <= 3.0001);
});

test("尺寸完全一致时验收通过", () => {
  const check = checkOutputDimensions(1024, 1536, { width: 1024, height: 1536 });
  assert.equal(check.decision, "accept");
  assert.equal(check.ratioError, 0);
});

test("宽高比一致但分辨率不同时等比归一化", () => {
  const check = checkOutputDimensions(512, 768, { width: 1024, height: 1536 });
  assert.equal(check.decision, "normalize");
});

test("宽高比不一致时判定失败", () => {
  const check = checkOutputDimensions(1536, 1024, { width: 1024, height: 1536 });
  assert.equal(check.decision, "fail");
  assert.match(check.reason || "", /宽高比/);
});
