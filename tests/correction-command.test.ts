import test from "node:test";
import assert from "node:assert/strict";
import {correctionCommandText,correctionPlanFromText} from "../src/lib/correction-command";

test("强制咒语保留原文并按五类规则传入生成提示",()=>{
  const plan={original:"扣子必须改成3个，黑色边保持黑色，其余不能改变",mustChange:["扣子数量改为3个"],mustKeep:["黑色包边保持黑色"],forbiddenChanges:["不得改变其余区域"],referenceSources:["修正前图片"],acceptanceCriteria:["可见扣子恰好3个"]};
  const text=correctionCommandText(plan);
  assert.match(text,/用户原始咒语（不得删改或弱化）/);
  assert.match(text,/用户强制命令 > 用户人工确认规则 > 产品图真实细节 > 系统自动建议 > 默认Prompt/);
  assert.deepEqual(correctionPlanFromText(text),plan);
});

test("非咒语提示不会误触发指令命中检查",()=>{
  assert.equal(correctionPlanFromText("普通换装提示"),undefined);
});
