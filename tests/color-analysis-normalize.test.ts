import test from "node:test";
import assert from "node:assert/strict";
import {chooseSpecificColorName,generationColorName,normalizeColorAnalysisPayload,normalizeMaterialFeatures,normalizeTrimPart} from "../src/lib/ai/color-analysis-normalize";

test("面料特征文字保持原样",()=>{
  assert.equal(normalizeMaterialFeatures(" 细密针织，哑光，垂感自然 "),"细密针织，哑光，垂感自然");
});

test("面料特征对象会自动整理成可读文字",()=>{
  assert.equal(normalizeMaterialFeatures({
    texture:"细密纹理",
    weave:"针织",
    luster:"哑光",
    thickness:"中等",
    drape:"自然垂顺",
  }),"纹理：细密纹理；织法：针织；光泽：哑光；厚薄：中等；垂感：自然垂顺");
});

test("面料特征数组和空值也可以安全处理",()=>{
  assert.equal(normalizeMaterialFeatures(["柔软","轻薄","垂感好"]),"柔软、轻薄、垂感好");
  assert.equal(normalizeMaterialFeatures(null),"");
});

test("具体看图名称优先，含糊名称使用HEX校准名",()=>{
  assert.equal(chooseSpecificColorName("巧克力棕","栗棕色"),"巧克力棕");
  assert.equal(chooseSpecificColorName("棕色","巧克力棕"),"巧克力棕");
  assert.equal(chooseSpecificColorName("颜色1","黄褐卡其色"),"黄褐卡其色");
});

test("辅色部位会进入统一作图名称",()=>{
  assert.equal(normalizeTrimPart("滚边"),"包边");
  assert.equal(normalizeTrimPart("",["袖口有白色条纹"]),"条纹");
  assert.equal(generationColorName("黄褐卡其色","黑色","包边"),"黄褐卡其色黑色包边");
  assert.equal(generationColorName("藏青色","白色","条纹"),"藏青色白色条纹");
  assert.equal(generationColorName("冷白色","黑色","扣子"),"冷白色");
  assert.equal(generationColorName("黄褐卡其色","黑边","包边"),"黄褐卡其色黑色包边");
  assert.equal(generationColorName("象牙白","",""),"象牙白");
});

test("兼容模型把设计细节返回字符串、局部颜色使用color字段、遮挡使用布尔值",()=>{
  const result=normalizeColorAnalysisPayload({colors:[{
    name:"奶白色",
    hex:"f2eadb",
    confidence:"92%",
    boundingBox:{x:"0.1",y:"0.2",width:"0.3",height:"0.5"},
    designDetails:"黑色包边；四颗纽扣",
    colorRegions:[
      {part:"主体",color:"奶白色",hex:"#F2EADB",confidence:91},
      {area:"包边",name:"黑色",colorHex:"101010",confidence:"0.88"},
    ],
    occlusion:true,
    structureDifferences:"",
  }]}) as {colors:Array<Record<string,unknown>>};
  assert.deepEqual(result.colors[0].designDetails,["黑色包边","四颗纽扣"]);
  assert.deepEqual(result.colors[0].boundingBox,{x:0.1,y:0.2,width:0.3,height:0.5});
  assert.equal(result.colors[0].hex,"#F2EADB");
  assert.equal(result.colors[0].confidence,0.92);
  assert.equal(result.colors[0].occlusion,"partial");
  assert.deepEqual(result.colors[0].structureDifferences,[]);
  assert.deepEqual(result.colors[0].colorRegions,[
    {part:"主体",color:"奶白色",hex:"#F2EADB",confidence:0.91,colorName:"奶白色"},
    {area:"包边",name:"黑色",colorHex:"101010",confidence:0.88,part:"包边",colorName:"黑色",hex:"#101010"},
  ]);
});

test("颜色局部缺少colorName时保留结果并标记待人工确认",()=>{
  const result=normalizeColorAnalysisPayload({colors:[{
    name:"深卡其色",hex:"#867354",designDetails:"同款结构",
    colorRegions:[{part:"扣子",hex:"#101010"}],occlusion:false,
  }]}) as {colors:Array<{colorRegions:Array<{colorName:string}>,occlusion:string}>};
  assert.equal(result.colors[0].colorRegions[0].colorName,"待人工确认");
  assert.equal(result.colors[0].occlusion,"none");
});
