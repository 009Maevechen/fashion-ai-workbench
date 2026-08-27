import test from "node:test";
import assert from "node:assert/strict";
import { composePrompt, buildGarmentProtectionModule, type PromptModules } from "../src/lib/visual-prompt";
import { scoreReference } from "../src/lib/visual-production-plan";

test("scoreReference 按商品类型/子类/景别/露脸评分", () => {
  const a = scoreReference(
    { productType: "裤装", productSubtype: "阔腿裤", shotType: "全身", faceVisible: false },
    { productType: "裤装", productSubtype: "阔腿裤", shotType: "全身", faceVisible: false },
  );
  // 类型35 + 子类25 + 景别20 + 露脸12 = 92（展示重点需子类出现在 displayFocus 才加）
  assert.equal(a.score, 92);
  const b = scoreReference(
    { productType: "上衣", shotType: "上半身", faceVisible: true },
    { productType: "裤装", shotType: "全身", faceVisible: false },
  );
  assert.ok(b.score < 50);
});

test("scoreReference 子类匹配优先于纯类型匹配", () => {
  const exact = scoreReference({ productType: "裤装", productSubtype: "阔腿裤" }, { productType: "裤装", productSubtype: "阔腿裤" });
  const typeOnly = scoreReference({ productType: "裤装" }, { productType: "裤装", productSubtype: "阔腿裤" });
  assert.ok(exact.score > typeOnly.score);
});

test("buildGarmentProtectionModule 包含商品类别与保护项", () => {
  const protection = buildGarmentProtectionModule({
    productType: "裤装",
    attributes: { fabric: "牛仔", fit: "宽松" },
    protectionItems: ["保持裤型", "保持腰头"],
  });
  assert.match(protection, /裤装/);
  assert.match(protection, /牛仔/);
  assert.match(protection, /保持裤型/);
});

test("composePrompt 按模块组合且忽略空模块", () => {
  const modules: PromptModules = {
    poseDescription: "自然站立",
    composition: "居中构图",
    displayFocus: "",
    personRequirement: "",
    garmentProtection: "保持面料材质",
    forbidden: "禁止改变颜色",
  };
  const prompt = composePrompt(modules);
  assert.match(prompt, /姿势要求：自然站立/);
  assert.match(prompt, /构图要求：居中构图/);
  assert.match(prompt, /服装保护/);
  assert.match(prompt, /禁止修改项：禁止改变颜色/);
  assert.doesNotMatch(prompt, /展示重点/);
  assert.doesNotMatch(prompt, /人物要求/);
});
