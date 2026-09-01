import test from "node:test";
import assert from "node:assert/strict";
import {tryonPrompt} from "../src/lib/ai/prompts/tryon";
import {posePrompt} from "../src/lib/ai/prompts/pose";
import {recolorPrompt} from "../src/lib/ai/prompts/recolor";

test("所有作图步骤统一要求高清写实、真实皮肤和面料一致",()=>{
  const prompts=[
    tryonPrompt("上衣","针织上衣","保持结构",true),
    posePrompt("自然站立","上衣","全身",true,true,"保持结构"),
    recolorPrompt("上衣","黑色","#111111",["背景"],"保持结构",true),
  ];
  for(const prompt of prompts){
    assert.match(prompt,/高清、写实、自然/);
    assert.match(prompt,/自然毛孔、肌理/);
    assert.match(prompt,/面料材质、织法、纹理/);
    assert.match(prompt,/禁止低清、模糊/);
  }
});

test("所有作图步骤都以参考模特图为皮肤质感与画质最高优先级基准",()=>{
  const prompts=[
    tryonPrompt("上衣","针织上衣","保持结构",true),
    posePrompt("自然站立","上衣","全身",true,true,"保持结构"),
    recolorPrompt("上衣","黑色","#111111",["背景"],"保持结构",true),
  ];
  for(const prompt of prompts){
    assert.match(prompt,/皮肤质感与画质/);
    assert.match(prompt,/肤色、皮肤质感、光泽感、细腻度/);
    assert.match(prompt,/假白、塑料感、磨皮过度/);
    assert.match(prompt,/禁止肤色偏差/);
  }
});
