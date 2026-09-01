import assert from "node:assert/strict";
import test from "node:test";
import {tryonPrompt} from "../src/lib/ai/prompts/tryon";
import {posePrompt} from "../src/lib/ai/prompts/pose";
import {recolorPrompt} from "../src/lib/ai/prompts/recolor";

const prompts=(showFace:boolean)=>[
  tryonPrompt("上衣","黑色针织上衣","保持结构",showFace),
  posePrompt("自然站立","上衣","全身",showFace,true,"保持结构"),
  recolorPrompt("上衣","黑色","#000000",["背景"],"保持结构",showFace),
];

test("换装和姿势默认不露出或补画脸部，复色跟随输入图",()=>{
  for(const prompt of prompts(false).slice(0,2)){assert.match(prompt,/最终图片不得露出脸部/);assert.match(prompt,/不得生成、补画或露出任何人物脸部/)}
  const recolor = prompts(false)[2];
  assert.match(recolor,/上一流程已经确认的姿势\/换装结果/);
  assert.match(recolor,/露脸与原图样式锁定/);
  assert.match(recolor,/没有脸就不得补画/);
  assert.match(recolor,/不得改变原图人物、姿势、景别、构图、背景或光影/);
  assert.match(recolor,/人物与构图最高优先级/);
});

test("换装和姿势开启露脸时保留原模特脸部，复色不受开关改变",()=>{
  for(const prompt of prompts(true).slice(0,2)){assert.match(prompt,/允许露出脸部/);assert.match(prompt,/不得换脸或生成另一张脸/);assert.doesNotMatch(prompt,/最终图片不得露出脸部/)}
  const recolor = prompts(true)[2];
  assert.match(recolor,/上一流程已经确认的姿势\/换装结果/);
  assert.match(recolor,/有脸就保留同一张脸/);
  assert.match(recolor,/不得改变原图人物、姿势、景别、构图、背景或光影/);
  assert.match(recolor,/人物与构图最高优先级/);
  assert.doesNotMatch(recolor,/最终图片不得露出脸部/);
});
