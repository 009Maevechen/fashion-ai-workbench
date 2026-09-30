import test from "node:test";
import assert from "node:assert/strict";
import {
  applyExplicitAbsenceRules,
  filterValuableProductVisualDetection,
  parseProductVisualDetection,
} from "../src/lib/ai/product-visual-regions-normalize";

const box = { x: 0.1, y: 0.1, width: 0.4, height: 0.4 };
const region = (type: "frontView" | "detail", confidence: number, label = "领口") => ({
  type,
  label,
  confidence,
  boundingBox: box,
  needsReview: confidence < 0.6,
  reason: "边界清晰",
  usableForGeneration: true,
  visibleEvidence: "目标结构完整可见",
  viewDirection: type === "frontView" ? "front" as const : "detail" as const,
  targetCoverage: 0.8,
});

test("视觉区域识别超长 label 会被截断而不是报错", () => {
  const longLabel = "领口细节包含白色包边与不对称黑色镶边，并带有两颗装饰性纽扣以及精致的缝线纹理和细腻的针织结构说明";
  assert.ok(longLabel.length > 40, "测试输入应为超长文本");
  const result = parseProductVisualDetection({ regions: [region("detail", 0.9, longLabel)], missing: [] });
  assert.ok(result.regions[0].label.length <= 40);
  assert.ok(result.regions[0].label.length > 0);
});

test("视觉区域识别超长 reason 会被截断而不是报错", () => {
  const longReason = "该区域因边界不够清晰且包含部分背景内容建议人工复核后重新框选以确保后续生成时不会把无关背景误判为服装细节同时保持边界贴合服装本体结构避免领口包边袖口拼接门襟纽扣下摆弧度等设计细节在裁剪过程中被遗漏或错位从而影响最终的细节保护和复色准确性请务必完整框选整件服装范围不要遗漏任何可见细节".repeat(2);
  assert.ok(longReason.length > 200);
  const input = region("detail", 0.9);
  input.reason = longReason;
  const result = parseProductVisualDetection({ regions: [input], missing: [] });
  assert.ok(result.regions[0].reason.length <= 200);
});

test("正常简短 label 原样保留", () => {
  const result = parseProductVisualDetection({ regions: [region("detail", 0.9)], missing: [] });
  assert.equal(result.regions[0].label, "领口");
  assert.equal(result.regions[0].reason, "边界清晰");
});

test("超过 16 个重复区域时会保留每类最可信的一处而不是让整次识别失败", () => {
  const regions = Array.from({ length: 20 }, (_, index) =>
    region(index % 2 === 0 ? "frontView" : "detail", 0.5 + index / 100),
  );
  const result = parseProductVisualDetection({ regions, missing: [] });
  assert.equal(result.regions.length, 2);
  assert.ok(Math.abs((result.regions.find((item) => item.type === "frontView")?.confidence || 0) - 0.68) < 0.0001);
  assert.ok(Math.abs((result.regions.find((item) => item.type === "detail")?.confidence || 0) - 0.69) < 0.0001);
});

test("已经识别出的类型不会同时出现在缺失列表", () => {
  const result = parseProductVisualDetection({
    regions: [region("detail", 0.9)],
    missing: [
      { type: "detail", label: "综合细节", reason: "误报缺失" },
      { type: "backView", label: "背面", reason: "图片未展示" },
    ],
  });
  assert.deepEqual(result.missing.map((item) => item.type), ["backView"]);
});

test("正面照片误标为背面时不得进入背面素材", () => {
  const parsed = parseProductVisualDetection({
    regions: [{
      ...region("frontView", 0.95),
      type: "backView",
      label: "错误背面",
      viewDirection: "front",
    }],
    missing: [],
  });
  const result = filterValuableProductVisualDetection(parsed);
  assert.equal(result.regions.length, 0);
  assert.equal(result.missing[0]?.type, "backView");
  assert.match(result.missing[0]?.reason || "", /没有明确展示服装真实背面/);
});

test("低置信度或目标占比过低的局部裁图会被拒绝", () => {
  const parsed = parseProductVisualDetection({
    regions: [{
      ...region("detail", 0.81),
      targetCoverage: 0.25,
      usableForGeneration: true,
    }],
    missing: [],
  });
  const result = filterValuableProductVisualDetection(parsed);
  assert.equal(result.regions.length, 0);
  assert.match(result.missing[0]?.reason || "", /置信度/);
});

test("高置信度且范围完整的有价值细节允许进入素材", () => {
  const parsed = parseProductVisualDetection({
    regions: [region("detail", 0.93)],
    missing: [],
  });
  const result = filterValuableProductVisualDetection(parsed);
  assert.equal(result.regions.length, 1);
  assert.equal(result.missing.length, 0);
});

test("商品资料明确无口袋时不展示口袋裁图", () => {
  const parsed = parseProductVisualDetection({
    regions: [{
      ...region("detail", 0.95, "错误口袋"),
      type: "pockets",
    }],
    missing: [],
  });
  const result = applyExplicitAbsenceRules(parsed, { pocketDetails: "无口袋" });
  assert.equal(result.regions.length, 0);
  assert.equal(result.missing[0]?.type, "pockets");
  assert.match(result.missing[0]?.reason || "", /结构不存在/);
});

test("有口袋时保留通过语义审核的口袋裁图", () => {
  const parsed = parseProductVisualDetection({
    regions: [{
      ...region("detail", 0.95, "斜插袋完整开口"),
      type: "pockets",
    }],
    missing: [],
  });
  const result = applyExplicitAbsenceRules(parsed, { pocketDetails: "左右各1个斜插袋" });
  assert.equal(result.regions.length, 1);
  assert.equal(result.regions[0]?.type, "pockets");
});

test("纯色商品不创建印花特写但不影响其他细节", () => {
  const parsed = parseProductVisualDetection({
    regions: [
      { ...region("detail", 0.93, "错误印花"), type: "print" },
      { ...region("detail", 0.94, "真实领口"), type: "neckline" },
    ],
    missing: [],
  });
  const result = applyExplicitAbsenceRules(parsed, { printType: "纯色" });
  assert.deepEqual(result.regions.map((item) => item.type), ["neckline"]);
  assert.equal(result.missing.find((item) => item.type === "print")?.label, "印花特写");
});
