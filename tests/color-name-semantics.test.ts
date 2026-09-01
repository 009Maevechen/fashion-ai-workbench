import test from "node:test";
import assert from "node:assert/strict";
import { parseColorName, colorNameRuleText } from "../src/lib/color-name-semantics";

test("解析“白色衣服黑色边”得到主色白色 + 边黑色", () => {
  const result = parseColorName("白色衣服黑色边");
  assert.equal(result.mainColor, "白色");
  assert.deepEqual(result.parts, [{ part: "边", color: "黑色" }]);
  assert.equal(result.needsReview, false);
});

test("解析“黑色裤子白色条纹”得到主色黑色 + 条纹白色", () => {
  const result = parseColorName("黑色裤子白色条纹");
  assert.equal(result.mainColor, "黑色");
  assert.deepEqual(result.parts, [{ part: "条纹", color: "白色" }]);
});

test("解析“卡其色上衣黑色扣子”得到主色卡其色 + 扣子黑色", () => {
  const result = parseColorName("卡其色上衣黑色扣子");
  assert.equal(result.mainColor, "卡其色");
  assert.deepEqual(result.parts, [{ part: "扣子", color: "黑色" }]);
});

test("解析“黑色白包边”得到主色黑色 + 包边白色，且不误判为边", () => {
  const result = parseColorName("黑色白包边");
  assert.equal(result.mainColor, "黑色");
  assert.deepEqual(result.parts, [{ part: "包边", color: "白色" }]);
});

test("简单名称“白色”无部位，不需要人工确认", () => {
  const result = parseColorName("白色");
  assert.equal(result.mainColor, "白色");
  assert.deepEqual(result.parts, []);
  assert.equal(result.needsReview, false);
});

test("名称中有颜色词但没有部位关键词时提示人工确认", () => {
  const result = parseColorName("白色黑色");
  assert.equal(result.mainColor, "白色");
  assert.equal(result.needsReview, true);
});

test("生成规则文本明确写出各部位颜色", () => {
  const semantics = parseColorName("白色衣服黑色边");
  const rule = colorNameRuleText(semantics);
  assert.match(rule, /主体颜色是“白色”/);
  assert.match(rule, /边必须是黑色/);
  assert.match(rule, /不得混同或省略/);
});
