import test from "node:test";
import assert from "node:assert/strict";
import {projectModuleHref,projectResumeHref,projectStepFromPath,projectStepHref,workbenchSkuHref} from "../src/lib/project-navigation";

test("项目列表未加载时不把制作流程错误指向首页",()=>{
  assert.equal(projectModuleHref("tryon","",[],false),null);
});

test("制作流程只使用当前 SKU，不暗中跳到别的项目",()=>{
  assert.equal(projectModuleHref("pose","current",["first"],true),"/projects/current/pose");
  assert.equal(projectModuleHref("recolor","",["first"],true),null);
  assert.equal(projectModuleHref("final","",[],true),null);
});

test("恢复实际待处理步骤并保留返回表格的 SKU",()=>{
  assert.equal(projectStepHref("p1",3),"/projects/p1/pose");
  assert.equal(projectStepFromPath("/projects/p1/recolor",1),4);
  assert.equal(projectStepFromPath("/projects/p1/pose",5),3);
  assert.equal(projectStepFromPath("/projects/p1",2),2);
  assert.equal(projectResumeHref({id:"p1",currentStep:4,stepStatuses:{"2":"needs_redo"}}),"/projects/p1/tryon");
  assert.equal(projectResumeHref({id:"p1",currentStep:3,stepStatuses:{}}),"/projects/p1/pose");
  assert.equal(workbenchSkuHref("JR 00507"),"/workbench?sku=JR%2000507#sku-project-list");
});
