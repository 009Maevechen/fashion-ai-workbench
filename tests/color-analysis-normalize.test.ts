import test from "node:test";
import assert from "node:assert/strict";
import {chooseSpecificColorName,generationColorName,normalizeMaterialFeatures,normalizeTrimPart} from "../src/lib/ai/color-analysis-normalize";

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
  assert.equal(generationColorName("黄褐卡其色","黑边","包边"),"黄褐卡其色黑色包边");
  assert.equal(generationColorName("象牙白","",""),"象牙白");
});
