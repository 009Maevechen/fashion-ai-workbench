import test from "node:test";
import assert from "node:assert/strict";
import {recolorStructureNeedsReview,resolveRecolorConsistencyStatus,resolveRecolorStructureMode} from "../src/lib/recolor-structure";

test("复色默认锁定原款结构",()=>{
  assert.equal(resolveRecolorStructureMode("same",.99,[]),"same_style");
  assert.equal(resolveRecolorStructureMode("uncertain",.9,["疑似口袋不同"]),"same_style");
});

test("只有高置信度明确结构差异才允许颜色款改变设计",()=>{
  assert.equal(resolveRecolorStructureMode("explicit_difference",.84,["包边宽度不同"]),"same_style");
  assert.equal(resolveRecolorStructureMode("explicit_difference",.95,[]),"same_style");
  assert.equal(resolveRecolorStructureMode("explicit_difference",.95,["包边宽度不同"]),"explicit_variant");
});

test("遮挡导致同款关系无法判断时必须人工复核",()=>{
  assert.equal(recolorStructureNeedsReview("uncertain",.5,[],"partial"),true);
  assert.equal(recolorStructureNeedsReview("same",.92,[],"partial"),false);
  assert.equal(recolorStructureNeedsReview("explicit_difference",.7,["疑似口袋不同"],"none"),true);
});

test("严格复色校验会把结构变化、颜色错位和人物构图变化直接判失败",()=>{
  const healthy={silhouette:true,construction:true,colorMapping:true,regionIsolation:true,person:true,composition:true};
  assert.equal(resolveRecolorConsistencyStatus({consistent:true,score:91,checks:healthy}),"passed");
  assert.equal(resolveRecolorConsistencyStatus({consistent:false,score:78,checks:healthy}),"needs_review");
  assert.equal(resolveRecolorConsistencyStatus({consistent:false,score:82,checks:{...healthy,colorMapping:false}}),"failed");
  assert.equal(resolveRecolorConsistencyStatus({consistent:false,score:88,checks:{...healthy,person:false}}),"failed");
});
