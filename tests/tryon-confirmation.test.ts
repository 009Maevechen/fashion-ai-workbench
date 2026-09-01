import test from "node:test";
import assert from "node:assert/strict";
import {canConfirmTryonSelection,isSameTryonConfirmation,tryonCompletionPatch,tryonSubjectFidelityFailurePatch} from "../src/lib/tryon-confirmation";
import type {Job,Project} from "../src/lib/db";

const image="/api/files/SKU-1/tryon/SKU-1_tryon_02.jpg";
const job=(status:Job["status"],overrides:Partial<Job>={}):Job=>({
  id:"job-2",
  projectId:"project-1",
  sku:"SKU-1",
  workflow:"tryon",
  provider:"provider",
  model:"model",
  mode:"standard",
  inputImages:[],
  outputImages:[image],
  promptVersion:"tryon-v1",
  status,
  startedAt:"2026-01-01T00:00:00.000Z",
  slot:2,
  ...overrides,
});

test("复制产品图模特或残留原服装特征的换装结果直接失败且禁止确认",()=>{
  assert.deepEqual(tryonSubjectFidelityFailurePatch(),{
    status:"failed",
    requestStatus:"failed",
    errorMessage:"换装主体错误：结果残留了参考模特原服装特征、复制/更接近了服装产品图中的模特、或皮肤质感画质明显低于参考模特图，已禁止确认。请重新生成",
  });
});
const project=(confirmedTryonImage?:string):Project=>({
  id:"project-1",
  sku:"SKU-1",
  productName:"测试商品",
  productType:"上衣",
  currentStep:2,
  status:"生成中",
  createdAt:"2026-01-01T00:00:00.000Z",
  updatedAt:"2026-01-01T00:00:00.000Z",
  assets:{},
  settings:{},
  stepStatuses:{"1":"confirmed","2":"generating","3":"not_started","4":"not_started","5":"not_started"},
  confirmedTryonImage,
});

test("已选成功候选可在另一候选仍生成时确认",()=>{
  const jobs=[job("success"),job("generating",{id:"job-1",slot:1,outputImages:[]})];
  assert.equal(canConfirmTryonSelection(image,jobs),true);
});

test("未完成、失败或过期的候选不能确认",()=>{
  assert.equal(canConfirmTryonSelection(image,[job("generating")]),false);
  assert.equal(canConfirmTryonSelection(image,[job("failed")]),false);
  assert.equal(canConfirmTryonSelection(image,[job("success",{dependencyStatus:"stale"})]),false);
});

test("后台候选完成后不会覆盖已经确认的换装步骤",()=>{
  const patch=tryonCompletionPatch(project(image),"awaiting_confirmation");
  assert.equal(patch.stepStatuses?.["2"],"confirmed");
  assert.equal(patch.status,undefined);
});

test("重复确认同一张换装图不会触发下游失效",()=>{
  assert.equal(isSameTryonConfirmation(image,image),true);
  assert.equal(isSameTryonConfirmation(image,"/api/files/SKU-1/tryon/other.jpg"),false);
  assert.equal(isSameTryonConfirmation(undefined,image),false);
});

test("尚未确认时按候选完成情况更新换装步骤",()=>{
  const patch=tryonCompletionPatch(project(),"partial_success");
  assert.equal(patch.stepStatuses?.["2"],"partial_success");
  assert.equal(patch.status,"等待人工确认");
});
