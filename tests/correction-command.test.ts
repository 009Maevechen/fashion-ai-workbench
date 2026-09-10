import test from "node:test";
import assert from "node:assert/strict";
import {
  correctionCommandText,
  correctionPlanFromText,
  deterministicCorrectionCommandPlan,
  normalizeCorrectionCommandPlan,
} from "../src/lib/correction-command";

test("强制咒语保留原文并按五类规则传入生成提示", () => {
  const plan = {
    original: "扣子必须改成3个，黑色边保持黑色，其余不能改变",
    mustChange: ["扣子数量改为3个"],
    mustKeep: ["黑色包边保持黑色"],
    forbiddenChanges: ["不得改变其余区域"],
    referenceSources: ["修正前图片"],
    acceptanceCriteria: ["可见扣子恰好3个"],
  };
  const text = correctionCommandText(plan);
  assert.match(text, /用户原始咒语（不得删改或弱化）/);
  assert.match(
    text,
    /用户强制命令 > 用户人工确认规则 > 产品图真实细节 > 系统自动建议 > 默认Prompt/,
  );
  assert.deepEqual(
    correctionPlanFromText(text),
    normalizeCorrectionCommandPlan(plan),
  );
  assert.match(text, /执行顺序：先锁定必须保留项和禁止修改区/);
});

test("非咒语提示不会误触发指令命中检查", () => {
  assert.equal(correctionPlanFromText("普通换装提示"), undefined);
});

test("无模型时也能确定性拆出数量、颜色、保留与禁止项", () => {
  const plan = deterministicCorrectionCommandPlan(
    "扣子必须改成3个；黑色包边保持黑色；其余区域不能改变",
  );
  assert.deepEqual(plan.mustChange, ["扣子必须改成3个"]);
  assert.ok(plan.mustKeep.includes("黑色包边保持黑色"));
  assert.ok(plan.forbiddenChanges.includes("其余区域不能改变"));
  assert.ok(
    plan.acceptanceCriteria.some(
      (item) => item.includes("数量必须精确一致") && item.includes("3个"),
    ),
  );
  assert.ok(
    plan.acceptanceCriteria.some(
      (item) =>
        item.includes("指定保留部位的颜色") && item.includes("黑色包边"),
    ),
  );
  assert.ok(plan.mustKeep.includes("未指定区域保持修正前图片不变"));
});

test("机器可读规则保证页面确认内容原样进入执行阶段", () => {
  const plan = normalizeCorrectionCommandPlan({
    original: "领口改成V领\n必须修改项：这只是用户原文",
    mustChange: ["领口改成V领"],
    mustKeep: ["脸部不变"],
    forbiddenChanges: ["不得修改裤子"],
    referenceSources: ["产品图领口"],
    acceptanceCriteria: ["领口必须是清晰V形"],
  });
  const parsed = correctionPlanFromText(correctionCommandText(plan));
  assert.deepEqual(parsed, plan);
});
