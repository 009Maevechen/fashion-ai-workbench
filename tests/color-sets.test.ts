import test from "node:test";
import assert from "node:assert/strict";
import {colorResultCount,colorSetIssue,duplicateColorNames,isColorSetComplete,mergeAnalyzedColorDetails,recolorColorName,recolorGenerationTrim} from "../src/lib/color-sets";
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

test("两张已确认姿势可以组成两张复色套装",()=>{
  const color:TargetColor={id:"two",name:"米白色",hex:"#EEE9DF",sourceCount:2,status:"confirmed",poseResults:["/1.jpg","/2.jpg"]};
  assert.equal(isColorSetComplete(color),true);
  assert.equal(colorSetIssue(color),"已完成");
});

test("复色输出名称包含主色与边饰颜色",()=>{
  assert.equal(recolorColorName({name:"黄褐卡其色",outputName:"黄褐卡其色黑色包边"}),"黄褐卡其色黑色包边");
  assert.equal(recolorColorName({name:"黄褐卡其色",trimColorName:"黑色"}),"黄褐卡其色黑边");
  assert.equal(recolorColorName({name:"巧克力棕",trimColorName:"白色"}),"巧克力棕白边");
  assert.equal(recolorColorName({name:"巧克力棕白边",trimColorName:"白色"}),"巧克力棕白边");
  assert.equal(recolorColorName({name:"识别错误",trimColorName:"白色",outputName:"手动修改的黑边款"}),"手动修改的黑边款");
});

test("手动输出名称中的黑边白边覆盖自动识别残留的边饰颜色",()=>{
  assert.deepEqual(recolorGenerationTrim({outputName:"深卡其色黑边",trimColorName:"白色",trimHex:"#F4F6F5"}),{trimColorName:"黑色",trimHex:"#101010"});
  assert.deepEqual(recolorGenerationTrim({outputName:"巧克力棕白边",trimColorName:"黑色",trimHex:"#101010"}),{trimColorName:"白色",trimHex:"#F4F6F5"});
  assert.deepEqual(recolorGenerationTrim({outputName:"雾蓝色",trimColorName:"黑色",trimHex:"#101010"}),{trimColorName:"黑色",trimHex:"#101010"});
});

test("重复名称检查以用户手动输出名称为准",()=>{
  const colors=[
    {...complete("识别色一"),outputName:"黄褐卡其色黑边"},
    {...complete("识别色二"),outputName:"黄褐卡其色黑边"},
  ];
  assert.deepEqual([...duplicateColorNames(colors)],["黄褐卡其色黑边"]);
});

test("重新识别会把黑边白边写回已有色卡并保留生成结果",()=>{
  const existing=[
    {...complete("黄褐卡其色"),hex:"#A68D68"},
    {...complete("巧克力棕"),hex:"#58382D"},
  ];
  const result=mergeAnalyzedColorDetails(existing,[
    {name:"黄褐卡其色",hex:"#A88F69",trimColorName:"黑色",trimHex:"#101010"},
    {name:"巧克力棕",hex:"#59392E",trimColorName:"白色",trimHex:"#F4F6F5"},
  ]);
  assert.equal(recolorColorName(result.colors[0]),"黄褐卡其色黑边");
  assert.equal(recolorColorName(result.colors[1]),"巧克力棕白边");
  assert.equal(result.colors[0].name,"黄褐卡其色黑边");
  assert.equal(result.colors[1].name,"巧克力棕白边");
  assert.deepEqual(result.colors[0].poseResults,existing[0].poseResults);
  assert.equal(result.unmatched.length,0);
});

test("自动识别会写入每个颜色款的整件设计参考，人工框选优先保留",()=>{
  const automatic=mergeAnalyzedColorDetails(
    [{id:"khaki",name:"卡其色",hex:"#A68D68",status:"draft"}],
    [{name:"卡其色",hex:"#A88F69",cropImage:"/api/files/SKU/source/colors/auto.jpg",cropRegion:{x:0.1,y:0.1,width:0.3,height:0.7}}],
  );
  assert.equal(automatic.colors[0].cropImage,"/api/files/SKU/source/colors/auto.jpg");
  assert.equal(colorSetIssue(automatic.colors[0]),"复色结果 0/3");

  const manual=mergeAnalyzedColorDetails(
    [{id:"khaki",name:"卡其色",hex:"#A68D68",cropImage:"/api/files/SKU/source/colors/manual.jpg",cropRegion:{x:0.2,y:0.1,width:0.25,height:0.75},status:"ready"}],
    [{name:"卡其色",hex:"#A88F69",cropImage:"/api/files/SKU/source/colors/auto-new.jpg",cropRegion:{x:0,y:0,width:0.4,height:0.8}}],
  );
  assert.equal(manual.colors[0].cropImage,"/api/files/SKU/source/colors/manual.jpg");
});
