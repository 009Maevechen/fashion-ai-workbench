import test from "node:test";
import assert from "node:assert/strict";
import {
  parseProductionSets,
  parseStopBefore,
  productionSetFileName,
  productionSetNames,
  resolvePrecheckStatus,
} from "../src/lib/sku-production-plan";

test("F列备注：做一套 → 第一套", () => {
  const plan = parseProductionSets("做一套");
  assert.deepEqual(plan.sets, [0]);
  assert.equal(plan.needsReview, false);
});

test("F列备注：做两套上架 → 前两套", () => {
  const plan = parseProductionSets("做两套上架");
  assert.deepEqual(plan.sets, [0, 1]);
});

test("F列备注：做第二套图 → 只做第二套", () => {
  const plan = parseProductionSets("做第二套图");
  assert.deepEqual(plan.sets, [1]);
});

test("F列备注：做第二套图且在复色之前 → 第二套 + 截止复色前", () => {
  const plan = parseProductionSets("做第二套图，在复色之前的图片");
  assert.deepEqual(plan.sets, [1]);
  assert.equal(plan.stopBefore, "recolor");
});

test("F列备注：阿拉伯数字也支持", () => {
  assert.deepEqual(parseProductionSets("做3套").sets, [0, 1, 2]);
  assert.deepEqual(parseProductionSets("第2套").sets, [1]);
});

test("F列备注为空默认第一套，无法确认则 NEEDS_REVIEW", () => {
  assert.deepEqual(parseProductionSets("").sets, [0]);
  const vague = parseProductionSets("看情况安排一下");
  assert.equal(vague.needsReview, true);
});

test("截止阶段识别", () => {
  assert.equal(parseStopBefore("截止复色前"), "recolor");
  assert.equal(parseStopBefore("不做三姿势"), "pose");
  assert.equal(parseStopBefore("正常生产"), undefined);
});

test("多套文件命名：第一套原名，第二套名（1）", () => {
  assert.equal(productionSetFileName("SKU123.jpg", 0), "SKU123.jpg");
  assert.equal(productionSetFileName("SKU123.jpg", 1), "SKU123（1）.jpg");
  assert.equal(productionSetFileName("SKU123", 2), "SKU123（2）");
  assert.deepEqual(productionSetNames("a.jpg", 3), ["a.jpg", "a（1）.jpg", "a（2）.jpg"]);
});

test("预检状态：缺 SKU 或产品图 → BLOCKED", () => {
  assert.equal(
    resolvePrecheckStatus({ sku: "", hasProductImage: true, setPlan: parseProductionSets("做一套") }),
    "BLOCKED",
  );
  assert.equal(
    resolvePrecheckStatus({ sku: "A1", hasProductImage: false, setPlan: parseProductionSets("做一套") }),
    "BLOCKED",
  );
});

test("预检状态：套数不明/有未知图片/缺模特图 → NEEDS_REVIEW", () => {
  assert.equal(
    resolvePrecheckStatus({ sku: "A1", hasProductImage: true, setPlan: parseProductionSets("随便做") }),
    "NEEDS_REVIEW",
  );
  assert.equal(
    resolvePrecheckStatus({ sku: "A1", hasProductImage: true, setPlan: parseProductionSets("做一套"), unknownImageCount: 2 }),
    "NEEDS_REVIEW",
  );
  assert.equal(
    resolvePrecheckStatus({ sku: "A1", hasProductImage: true, setPlan: parseProductionSets("做一套"), needsModelButMissing: true }),
    "NEEDS_REVIEW",
  );
});

test("预检状态：字段齐全 → READY", () => {
  assert.equal(
    resolvePrecheckStatus({ sku: "A1", hasProductImage: true, hasModelImage: true, setPlan: parseProductionSets("做两套") }),
    "READY",
  );
});
