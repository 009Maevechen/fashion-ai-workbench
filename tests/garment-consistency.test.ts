import test from "node:test";
import assert from "node:assert/strict";
import type {Job,Project} from "../src/lib/db";
import {garmentConsistencyPrompt} from "../src/lib/ai/prompts/consistency";

const project={profile:{attributes:{fabric:"针织",fabricTexture:"罗纹"}},targetColors:[{id:"brown",name:"深卡其色",hex:"#8B7355",trimColorName:"黑边",trimHex:"#101010"}]} as Project;
const job={targetColorId:"brown",colorName:"深卡其色"} as Job;

test("姿势一致性忽略姿势背景但锁定服装材质设计",()=>{
  const prompt=garmentConsistencyPrompt("pose",project,job);
  assert.match(prompt,/姿势、人物和背景变化不会被当成服装差异|姿势、人物和构图变化不算服装不一致/);
  assert.match(prompt,/面料材质/);
  assert.match(prompt,/织法与纹理/);
});

test("换装一致性以原产品服装为基准并忽略模特差异",()=>{
  const prompt=garmentConsistencyPrompt("tryon",project,job);
  assert.match(prompt,/这是服装换装候选图/);
  assert.match(prompt,/版型、材质、纹理、颜色、包边和全部设计细节一致/);
  assert.match(prompt,/模特、姿势、构图和背景差异不算服装不一致/);
});

test("复色一致性要求目标主色和边饰并保护非目标服饰",()=>{
  const prompt=garmentConsistencyPrompt("recolor",project,job);
  assert.match(prompt,/深卡其色/);
  assert.match(prompt,/#8B7355/);
  assert.match(prompt,/黑边/);
  assert.match(prompt,/其他非目标服装不得变色/);
});
