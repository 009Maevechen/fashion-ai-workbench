import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import sharp from "sharp";
import { optimizeFinalImage, verifyFinalImage, FINAL_IMAGE_MAX_BYTES } from "../src/lib/image-optimize";

async function makeNoiseImage(width: number, height: number): Promise<Buffer> {
  const channels = 3;
  const raw = crypto.randomBytes(width * height * channels);
  return sharp(raw, { raw: { width, height, channels } })
    .jpeg({ quality: 100 })
    .toBuffer();
}

test("≤3MB 且尺寸足够的图片不会被再次压缩", async () => {
  const small = await sharp({
    create: { width: 1440, height: 1920, channels: 3, background: { r: 180, g: 120, b: 90 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
  const result = await optimizeFinalImage(small);
  assert.equal(result.optimized, false);
  assert.equal(result.finalSize, result.originalSize);
});

test("超过3MB的图片会被本地优化到3MB以内", async () => {
  const large = await makeNoiseImage(2048, 2731);
  assert.ok(large.length > FINAL_IMAGE_MAX_BYTES, "测试图应大于3MB");
  const result = await optimizeFinalImage(large);
  assert.ok(result.optimized);
  assert.ok(result.finalSize <= FINAL_IMAGE_MAX_BYTES);
});

test("优化后保持3:4比例", async () => {
  const large = await makeNoiseImage(2048, 2731);
  const result = await optimizeFinalImage(large);
  const meta = await sharp(result.buffer).metadata();
  const ratio = meta.width! / meta.height!;
  assert.ok(Math.abs(ratio - 0.75) < 0.02);
});

test("验证函数能识别超限文件", async () => {
  const large = await makeNoiseImage(2048, 2731);
  const verify = await verifyFinalImage(large);
  assert.equal(verify.ok, false);
  assert.equal(verify.reason, "文件超过3MB");
});
