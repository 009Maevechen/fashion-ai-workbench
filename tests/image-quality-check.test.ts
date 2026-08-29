import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { assessImageQuality } from "../src/lib/image-quality-check";

async function sampleSvg() {
  return Buffer.from(
    `<svg width="1728" height="2304">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#e8e4de"/><stop offset="1" stop-color="#d6d0c8"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect x="500" y="400" width="728" height="600" rx="20" fill="#9a7b62"/>
      <g stroke="#5a4a3a" stroke-width="3" fill="none">
        <line x1="520" y1="460" x2="1200" y2="460"/>
        <line x1="520" y1="540" x2="1200" y2="540"/>
      </g>
      <g fill="#3a2f24"><circle cx="1180" cy="900" r="12"/><circle cx="1180" cy="950" r="12"/></g>
      <text x="100" y="150" font-size="60" fill="#444">Woven texture detail</text>
    </svg>`,
  );
}

test("出图质量检测：高清清晰图不误报模糊或低分辨率", async () => {
  const clear = await sharp(await sampleSvg()).jpeg({ quality: 92 }).toBuffer();
  const result = await assessImageQuality(clear);
  assert.equal(result.lowResolution, false);
  assert.equal(result.blurry, false);
  assert.equal(result.issues.length, 0);
  assert.ok(result.sharpnessScore > 180, `清晰图锐度应高于阈值，实际 ${result.sharpnessScore}`);
});

test("出图质量检测：明显模糊图被判定为模糊", async () => {
  const clear = await sharp(await sampleSvg()).jpeg({ quality: 92 }).toBuffer();
  const blurry = await sharp(clear).blur(5).jpeg({ quality: 92 }).toBuffer();
  const result = await assessImageQuality(blurry);
  assert.equal(result.blurry, true);
  assert.ok(result.issues.some((issue) => issue.includes("清晰度") || issue.includes("模糊")));
});

test("出图质量检测：低分辨率图被判定为分辨率不足", async () => {
  const small = await sharp(await sampleSvg())
    .resize(512, 683)
    .jpeg({ quality: 90 })
    .toBuffer();
  const result = await assessImageQuality(small);
  assert.equal(result.lowResolution, true);
  assert.ok(result.issues.some((issue) => issue.includes("分辨率")));
});
