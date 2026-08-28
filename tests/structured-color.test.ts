import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { extractStructuredColors, grayWorldWhiteBalance } from "../src/lib/structured-color";

function solidImage(width: number, height: number, rgb: [number, number, number]) {
  return sharp({
    create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } },
  })
    .png()
    .toBuffer();
}

function twoToneImage(width: number, height: number, left: [number, number, number], right: [number, number, number]) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = x < width / 2 ? left : right;
      const offset = (y * width + x) * 3;
      raw[offset] = c[0];
      raw[offset + 1] = c[1];
      raw[offset + 2] = c[2];
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

test("灰度世界白平衡能校正暖光偏黄", () => {
  // 模拟暖光偏黄：B 通道偏低的灰色像素
  const width = 100;
  const height = 100;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    raw[i * 3] = 180;
    raw[i * 3 + 1] = 170;
    raw[i * 3 + 2] = 130; // 蓝通道偏暗 → 偏黄
  }
  const out = grayWorldWhiteBalance(new Uint8Array(raw), 3);
  // 校正后 B 通道应被增益，更接近 R/G
  assert.ok(out[2] > 130, "蓝通道应被增益");
  const rGain = out[0] / 180;
  const bGain = out[2] / 130;
  assert.ok(bGain > rGain, "蓝通道增益应大于红通道增益");
});

test("纯色服装图提取出主色", async () => {
  const img = await solidImage(300, 300, [90, 55, 40]);
  const result = await extractStructuredColors(img);
  assert.ok(result.primaryColor, "应有主色");
  assert.ok(result.primaryColor!.pixelRatio > 0.5, "主色占比应很高");
});

test("双色拼接图区分主色与辅色", async () => {
  const img = await twoToneImage(300, 300, [80, 50, 35], [20, 20, 20]);
  const result = await extractStructuredColors(img);
  assert.ok(result.primaryColor, "应有主色");
  assert.ok(result.secondaryColors.length >= 1 || result.accentColors.length >= 1, "应识别出第二种颜色");
});

test("近黑阴影不应被误判为主色", async () => {
  // 大面积棕色 + 少量近黑（阴影）
  const width = 300;
  const height = 300;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      const isShadow = y > height - 20; // 底部 20px 阴影
      raw[offset] = isShadow ? 4 : 120;
      raw[offset + 1] = isShadow ? 4 : 90;
      raw[offset + 2] = isShadow ? 4 : 60;
    }
  }
  const img = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const result = await extractStructuredColors(img);
  assert.ok(result.primaryColor, "应有主色");
  // 主色应是棕色而非近黑阴影
  const hex = result.primaryColor!.hex;
  const r = parseInt(hex.slice(1, 3), 16);
  assert.ok(r > 60, "主色不应是近黑阴影，应为棕色系");
});
