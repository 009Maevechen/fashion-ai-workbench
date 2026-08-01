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

test("换装、姿势和复色默认都不露出或补画脸部",()=>{
  for(const prompt of prompts(false)){assert.match(prompt,/最终图片不得露出脸部/);assert.match(prompt,/不得生成、补画或露出任何人物脸部/)}
});

test("只有开启露出脸部时才允许保留原模特脸部",()=>{
  for(const prompt of prompts(true)){assert.match(prompt,/允许露出脸部/);assert.match(prompt,/不得换脸或生成另一张脸/);assert.doesNotMatch(prompt,/最终图片不得露出脸部/)}
});
