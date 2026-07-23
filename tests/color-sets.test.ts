import test from "node:test";
import assert from "node:assert/strict";
import {colorResultCount,colorSetIssue,duplicateColorNames,isColorSetComplete} from "../src/lib/color-sets";
import type {TargetColor} from "../src/lib/db";

const complete=(name:string):TargetColor=>({id:name,name,hex:"#111111",status:"confirmed",poseResults:["/1.jpg","/2.jpg","/3.jpg"]});

test("每款颜色必须命名并拥有三张已确认结果",()=>{
  assert.equal(isColorSetComplete(complete("黑色")),true);
  assert.equal(isColorSetComplete({...complete(""),name:""}),false);
  assert.equal(isColorSetComplete({...complete("白色"),poseResults:["/1.jpg","/2.jpg"]}),false);
  assert.equal(isColorSetComplete({...complete("卡其色"),status:"success"}),false);
});

test("重复结果不能凑成三张完整套图",()=>{
  const color={...complete("黑色"),poseResults:["/1.jpg","/1.jpg","/2.jpg"]};
  assert.equal(colorResultCount(color),2);
  assert.equal(colorSetIssue(color),"复色结果 2/3");
});

test("颜色名称忽略大小写检查重复",()=>{
  const colors=[complete("Black"),complete("black"),complete("White")];
  assert.deepEqual([...duplicateColorNames(colors)],["black"]);
  assert.equal(colorSetIssue(colors[0],duplicateColorNames(colors)),"名称重复");
});

test("色差板基础色可作为当前颜色的有效色值",()=>{
  const color={...complete("米杏色"),hex:undefined,baseHex:"#C8A06A",status:"success" as const};
  assert.equal(colorSetIssue(color),"等待确认");
});
