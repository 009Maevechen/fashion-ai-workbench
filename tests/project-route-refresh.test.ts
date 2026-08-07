import test from "node:test";
import assert from "node:assert/strict";
import {findProjectByRouteKey} from "../src/lib/project-lookup";

const projects=[
  {id:"209c1873-5bc3-4db3-8a53-c051fbaadab8",sku:"166284",name:"上衣"},
  {id:"other-id",sku:"SY 200",name:"裤装"},
];

test("项目刷新路由同时支持内部ID与用户可见SKU",()=>{
  assert.equal(findProjectByRouteKey(projects,projects[0].id)?.sku,"166284");
  assert.equal(findProjectByRouteKey(projects,"166284")?.id,projects[0].id);
  assert.equal(findProjectByRouteKey(projects,"SY%20200")?.id,"other-id");
});

test("不存在的项目路由仍然返回空值",()=>{
  assert.equal(findProjectByRouteKey(projects,"missing"),undefined);
});
