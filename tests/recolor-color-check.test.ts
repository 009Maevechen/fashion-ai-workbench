import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRecolorColorRetryInstruction,
  resolveRecolorColorMatch,
  resolveRecolorGroupColorConsistency,
  RECOLOR_COLOR_DISTANCE_THRESHOLD,
  shouldAutoRetryRecolorColor,
} from "../src/lib/recolor-color-check";
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

test("明确目标色未通过时只允许自动重做一次", () => {
  const check = {
    passed: false,
    referenceHex: "#C9A882",
    outputHex: "#938677",
    distance: 21,
    issues: ["偏色"],
  };
  assert.equal(shouldAutoRetryRecolorColor(check, 0), true);
  assert.equal(shouldAutoRetryRecolorColor(check, 1), false);
  assert.match(buildRecolorColorRetryInstruction(check), /#C9A882/);
  assert.match(buildRecolorColorRetryInstruction(check), /不得以上一候选为底图/);
});

test("没有明确目标色或已通过时不自动重做", () => {
  assert.equal(
    shouldAutoRetryRecolorColor(
      { passed: false, distance: 20, issues: ["偏色"] },
      0,
    ),
    false,
  );
  assert.equal(
    shouldAutoRetryRecolorColor(
      {
        passed: true,
        referenceHex: "#C9A882",
        outputHex: "#C7A781",
        distance: 2,
        issues: [],
      },
      0,
    ),
    false,
  );
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

test("同一颜色款多姿势颜色接近时整组通过", () => {
  const result = resolveRecolorGroupColorConsistency([
    { slot: 1, outputHex: "#2F5B43" },
    { slot: 2, outputHex: "#305C44" },
    { slot: 3, outputHex: "#315A45" },
  ]);
  assert.equal(result.passed, true);
  assert.deepEqual(result.outlierSlots, []);
});

test("跨姿势明显漂色时只标记偏色的单张", () => {
  const result = resolveRecolorGroupColorConsistency([
    { slot: 1, outputHex: "#2F5B43" },
    { slot: 2, outputHex: "#305C44" },
    { slot: 3, outputHex: "#E8E4D8" },
  ]);
  assert.equal(result.passed, false);
  assert.deepEqual(result.outlierSlots, [3]);
  assert.match(result.issues[0], /姿势 3.*明显漂色/);
});
