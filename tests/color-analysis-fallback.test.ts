import test from "node:test";
import assert from "node:assert/strict";
import {localColorFallbackResult,visualFailureReason} from "../src/lib/ai/color-analysis-fallback";

test("账号池耗尽错误会转换为可理解的中文原因",()=>{
  assert.equal(
    visualFailureReason(new Error("All available accounts exhausted")),
    "视觉中转站账号池已耗尽（All available accounts exhausted）",
  );
});

test("远程视觉不可用时本地取色继续返回待确认色卡",()=>{
  const result=localColorFallbackResult({
    primaryColor:{name:"",hex:"#A08060",pixelRatio:.72,confidence:.9},
    secondaryColors:[],
    accentColors:[],
    colorVariants:[{name:"",hex:"#A08060",order:1,pixelRatio:.72,confidence:.9}],
    confidence:90,
    needsReview:false,
  },new Error("All available accounts exhausted"));
  assert.equal(result.colors.length,1);
  assert.equal(result.colors[0].needsReview,true);
  assert.equal(result.colors[0].trimColorName,"");
  assert.match(result.reviewReason,/已自动切换本地颜色分析/);
  assert.match(result.reviewReason,/账号池已耗尽/);
});
