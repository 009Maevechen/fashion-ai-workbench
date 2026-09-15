import test from "node:test";
import assert from "node:assert/strict";
import { resolveRecolorColorMatch, RECOLOR_COLOR_DISTANCE_THRESHOLD } from "../src/lib/recolor-color-check";
import { colorDistance } from "../src/lib/color-palette";

test("参考主色能在输出候选里找到接近颜色时通过", () => {
  const result = resolveRecolorColorMatch("#2F5B43", ["#000000", "#2F5B43", "#FFFFFF"]);
  assert.equal(result.passed, true);
  assert.ok(result.distance <= RECOLOR_COLOR_DISTANCE_THRESHOLD);
});

test("参考主色与输出候选全部相差过大时判失败", () => {
  const result = resolveRecolorColorMatch("#2F5B43", ["#000000", "#FFFFFF", "#FF0000"]);
  assert.equal(result.passed, false);
  assert.ok(result.distance > RECOLOR_COLOR_DISTANCE_THRESHOLD);
});

test("缺少参考主色时判失败", () => {
  const result = resolveRecolorColorMatch(undefined, ["#000000", "#FFFFFF"]);
  assert.equal(result.passed, false);
});

test("颜色距离函数能区分相近色与差异大的颜色", () => {
  const near = colorDistance("#2F5B43", "#305B44");
  const far = colorDistance("#2F5B43", "#FF0000");
  assert.ok(near < far);
});

test("人工基本色校验不受参考照片曝光色差覆盖", () => {
  const target = resolveRecolorColorMatch("#1A1A1A", ["#1B1B1B", "#E8E4D8"]);
  const photo = resolveRecolorColorMatch("#555555", ["#1B1B1B", "#E8E4D8"]);
  assert.equal(target.passed, true);
  assert.ok(target.distance < photo.distance);
});
