import assert from "node:assert/strict";
import test from "node:test";
import {TRYON_MODE_OPTIONS,TRYON_PRODUCT_TYPE_OPTIONS,TRYON_PROTECTION_OPTIONS} from "../src/lib/tryon-options";

function assertStableUniqueOptions(options:ReadonlyArray<{id:string;label:string}>){
  assert.equal(new Set(options.map(option=>option.id)).size,options.length,"选项id必须唯一");
  assert.equal(new Set(options.map(option=>option.label)).size,options.length,"选项显示文字不能重复");
  assert.ok(options.every(option=>/^[a-z0-9-]+$/.test(option.id)),"选项必须使用稳定技术id");
}

test("换装页所有列表配置使用稳定唯一id",()=>{
  assertStableUniqueOptions(TRYON_PRODUCT_TYPE_OPTIONS);
  assertStableUniqueOptions(TRYON_MODE_OPTIONS);
  assertStableUniqueOptions(TRYON_PROTECTION_OPTIONS);
});

test("重点保护项不会重复显示关键选项",()=>{
  const labels=TRYON_PROTECTION_OPTIONS.map(option=>option.label);
  for(const label of ["保持纽扣数量","保持白色包边","保持面料纹理"])assert.equal(labels.filter(item=>item===label).length,1,label);
});
