import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

// 与 product-visual-regions.ts 中的短文本校验保持一致，防止 AI 返回超长文本导致识别失败。
const shortLabel = z.string().min(1).max(400).transform((value) => value.trim().slice(0, 40));
const shortReason = z.string().min(1).max(1000).transform((value) => value.trim().slice(0, 200));

test("视觉区域识别超长 label 会被截断而不是报错", () => {
  const longLabel = "领口细节包含白色包边与不对称黑色镶边，并带有两颗装饰性纽扣以及精致的缝线纹理和细腻的针织结构说明";
  assert.ok(longLabel.length > 40, "测试输入应为超长文本");
  const result = shortLabel.parse(longLabel);
  assert.ok(result.length <= 40);
  assert.ok(result.length > 0);
});

test("视觉区域识别超长 reason 会被截断而不是报错", () => {
  const longReason = "该区域因边界不够清晰且包含部分背景内容建议人工复核后重新框选以确保后续生成时不会把无关背景误判为服装细节同时保持边界贴合服装本体结构避免领口包边袖口拼接门襟纽扣下摆弧度等设计细节在裁剪过程中被遗漏或错位从而影响最终的细节保护和复色准确性请务必完整框选整件服装范围不要遗漏任何可见细节".repeat(2);
  assert.ok(longReason.length > 200);
  const result = shortReason.parse(longReason);
  assert.ok(result.length <= 200);
});

test("正常简短 label 原样保留", () => {
  assert.equal(shortLabel.parse("领口"), "领口");
  assert.equal(shortReason.parse("边界清晰"), "边界清晰");
});
