import test from "node:test";
import assert from "node:assert/strict";
import {buildProductProtectionPrompt,DEFAULT_PROTECTION_ITEMS,TRYON_SAFETY_ITEMS} from "../src/lib/product-structure";

test("上衣结构提示明确禁止变成裙子和延长衣长",()=>{
  const prompt=buildProductProtectionPrompt("上衣",{attributes:{garmentLength:"短款",neckline:"圆领",sleeveType:"长袖",buttonCount:"5",trimColor:"白色",printPosition:"左胸",fabric:"针织",fabricTexture:"针织纹理",weaveStructure:"罗纹",gradientDesign:"明暗渐变",colorBlockLayout:"领口撞色",specialDesign:"荷叶边"}});
  assert.match(prompt,/这是一件上衣，不是裙子、连衣裙或长款外套/);
  assert.match(prompt,/禁止延长下摆/);
  for(const detail of ["短款","圆领","长袖","5","白色","左胸","针织","针织纹理","罗纹","明暗渐变","领口撞色","荷叶边"])assert.match(prompt,new RegExp(detail));
  assert.match(prompt,/材质与设计锁定/);
  assert.match(prompt,/渐变方向与过渡范围/);
});

test("结构保护和换装防错默认项覆盖关键商品特征",()=>{
  for(const item of ["保持领口","保持袖型","保持衣长","保持纽扣数量","保持印花位置","保持面料材质","保持面料纹理","保持织法结构","保持渐变设计","保持色块布局","保持特殊设计"])assert.ok(DEFAULT_PROTECTION_ITEMS.includes(item));
  for(const item of ["禁止改变服装类别","禁止把上衣生成裙子","禁止延长衣长"])assert.ok(TRYON_SAFETY_ITEMS.includes(item));
});

test("没有结构资料时仍然输出服装类型约束",()=>{
  assert.match(buildProductProtectionPrompt("裤装"),/这是一件裤装，禁止把它改变为其他服装类别/);
});
