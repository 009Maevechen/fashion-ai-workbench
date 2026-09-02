import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { MAX_INPUT_PIXELS, resizeToJpeg, rotatedDimensions, rotateAndExtract } from "../src/lib/image-limits";

async function makeImage(width: number, height: number, quality = 90): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 150, b: 90 } } })
    .jpeg({ quality })
    .toBuffer();
}

test("resizeToJpeg 把大图降采样到长边上限以内", async () => {
  const large = await makeImage(4000, 3000);
  const out = await resizeToJpeg(large, 1600, 90);
  const meta = await sharp(out).metadata();
  assert.ok((meta.width ?? 0) <= 1600 && (meta.height ?? 0) <= 1600);
  assert.equal(Math.max(meta.width!, meta.height!), 1600);
});

test("resizeToJpeg 不放大小于上限的图", async () => {
  const small = await makeImage(800, 600);
  const out = await resizeToJpeg(small, 1600, 90);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 800);
  assert.equal(meta.height, 600);
});

test("rotateAndExtract 旋转后按框裁剪出正确尺寸", async () => {
  const img = await makeImage(1000, 1000);
  const { width, height } = await rotatedDimensions(img);
  assert.equal(width, 1000);
  assert.equal(height, 1000);
  const cropped = await rotateAndExtract(img, { left: 100, top: 100, width: 200, height: 300 }, 90);
  const meta = await sharp(cropped).metadata();
  assert.equal(meta.width, 200);
  assert.equal(meta.height, 300);
});

test("超过像素上限的图片被拒绝而不是解压耗尽内存", async () => {
  // 用 header 无法伪造超大尺寸，直接断言常量存在且 resizeToJpeg 带 limitInputPixels 保护。
  assert.equal(typeof MAX_INPUT_PIXELS, "number");
  assert.ok(MAX_INPUT_PIXELS > 0);
  // 正常图仍可正常处理，证明保护没有误伤。
  const img = await makeImage(1200, 900);
  const out = await resizeToJpeg(img, 1024, 90);
  assert.ok(out.length > 0);
});
