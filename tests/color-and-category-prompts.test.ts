import test from "node:test";
import assert from "node:assert/strict";
import {tryonPrompt} from "../src/lib/ai/prompts/tryon";
import {recolorPrompt} from "../src/lib/ai/prompts/recolor";

test("换装提示词明确包含必选服装类目",()=>{
  const prompt=tryonPrompt("连衣裙","印花长裙","保持裙摆");
  assert.match(prompt,/服装类型：连衣裙/);
  assert.match(prompt,/不得改成其他服装类目/);
});

test("复色提示词只提取颜色且禁止复制参考图款式",()=>{
  const prompt=recolorPrompt("裙子","焦糖色","#C8A06A",["印花"],"保持背景");
  assert.match(prompt,/只提取颜色本身/);
  assert.match(prompt,/严禁从参考图复制服装款式/);
  assert.match(prompt,/#C8A06A/);
});
