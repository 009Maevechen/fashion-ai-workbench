import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  MAX_PRODUCT_DETAIL_SOURCE_DIMENSION,
  validateProductUpload,
} from "../src/lib/ai/validators";

function uploadFile(buffer:Buffer):File{
  const bytes=new ArrayBuffer(buffer.byteLength);
  new Uint8Array(bytes).set(buffer);
  return {size:buffer.byteLength,arrayBuffer:async()=>bytes} as File;
}

test("产品主图上传同时生成标准图和不超过 4096px 的高清工作副本", async () => {
  const input = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "#70543f" },
  })
    .jpeg({ quality: 98 })
    .toBuffer();
  const result = await validateProductUpload(
    uploadFile(input),
  );
  const [standard, detail] = await Promise.all([
    sharp(result.standard).metadata(),
    sharp(result.detailSource).metadata(),
  ]);

  assert.equal(result.sourceWidth, 1200);
  assert.equal(result.sourceHeight, 800);
  assert.equal(Math.max(standard.width || 0, standard.height || 0), 1200);
  assert.equal(Math.max(detail.width || 0, detail.height || 0), 2400);
  assert.ok((detail.width || 0) <= MAX_PRODUCT_DETAIL_SOURCE_DIMENSION);
  assert.equal(detail.format, "jpeg");
  assert.equal(result.enhancement.applied, true);
  assert.equal(result.enhancement.blurDetected, true);
  assert.equal(result.enhancement.needsReview, true);
  assert.ok(result.enhancement.methods.some((item) => item.includes("受控锐化")));
});

test("高分辨率产品图保留真实像素并受 4096px 安全上限约束", async () => {
  const input = await sharp({
    create: { width: 4600, height: 2300, channels: 3, background: "#ece7df" },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  const result = await validateProductUpload(
    uploadFile(input),
  );

  assert.equal(Math.max(result.detailWidth, result.detailHeight), 4096);
  assert.equal(Math.max(result.sourceWidth, result.sourceHeight), 4600);
  assert.ok(Number.isFinite(result.enhancement.sourceSharpness));
  assert.ok(Number.isFinite(result.enhancement.enhancedSharpness));
});
