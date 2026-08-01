import test from "node:test";
import assert from "node:assert/strict";
import {projectModuleHref} from "../src/lib/project-navigation";

test("项目列表未加载时不把制作流程错误指向首页",()=>{
  assert.equal(projectModuleHref("tryon","",[],false),null);
});

test("优先使用当前项目，首页则使用最近项目",()=>{
  assert.equal(projectModuleHref("pose","current",["first"],true),"/projects/current/pose");
  assert.equal(projectModuleHref("recolor","",["first"],true),"/projects/first/recolor");
  assert.equal(projectModuleHref("final","",[],true),null);
});
