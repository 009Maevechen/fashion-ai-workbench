import test from "node:test";
import assert from "node:assert/strict";
import {tryonPrompt} from "../src/lib/ai/prompts/tryon";
import {recolorPrompt} from "../src/lib/ai/prompts/recolor";
import {recolorAreaForProductType} from "../src/lib/recolor-scope";

test("换装提示词明确包含必选服装类目",()=>{
  const prompt=tryonPrompt("连衣裙","印花长裙","保持裙摆");
  assert.match(prompt,/服装类型：连衣裙/);
  assert.match(prompt,/不得改成其他服装类目/);
});

test("复色提示词只提取颜色且禁止复制参考图款式",()=>{
  const prompt=recolorPrompt("裙子","焦糖色","#C8A06A",["印花"],"保持背景",false,"白色","#FFFFFF");
  assert.match(prompt,/只提取颜色本身/);
  assert.match(prompt,/严禁从参考图复制服装款式/);
  assert.match(prompt,/#C8A06A/);
  assert.match(prompt,/边饰颜色：白色（#FFFFFF）/);
  assert.match(prompt,/色块布局/);
  assert.match(prompt,/不得新增、删除或移动色块/);
});

test("复色区域由商品类型锁定，上衣不得改动下装",()=>{
  assert.equal(recolorAreaForProductType("上衣"),"上衣");
  assert.equal(recolorAreaForProductType("裤装"),"裤子");
  assert.equal(recolorAreaForProductType("半身裙"),"裙子");
  const prompt=recolorPrompt("上衣","深咖啡色","#432E28",[],"");
  assert.match(prompt,/绝对不得改色的其他服饰：裤子、裙子/);
  assert.match(prompt,/颜色、材质、纹理、阴影和亮度/);
});
