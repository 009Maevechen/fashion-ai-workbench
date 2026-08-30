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

test("换装只把产品图作为服装真值并锁定尺寸材质与垂感",()=>{
  const prompt=tryonPrompt("上衣","针织短款上衣","保持领口和下摆");
  assert.match(prompt,/服装产品图：这是生成结果中服装外观的唯一真值、唯一来源和最高优先级依据/);
  assert.match(prompt,/换装主体必须是参考模特图/);
  assert.match(prompt,/模特参考图里的服装只是需要被移除的遮挡物/);
  assert.match(prompt,/景别与姿态强制锁定/);
  assert.match(prompt,/整体尺寸比例、衣长\/裤长\/裙长、宽度、围度、松量/);
  assert.match(prompt,/不得为了贴合模特参考图原服装而改变产品大小、长度或覆盖范围/);
  assert.match(prompt,/厚薄、重量感、硬挺或柔软程度、弹性/);
  assert.match(prompt,/重力下垂方向和垂坠感/);
  assert.match(prompt,/布料贴合身体后的自然褶皱可以随姿势变化，但材质属性、垂感强弱和结构尺寸不得改变/);
  assert.match(prompt,/不得新增、删除、移动、替换或重新设计任何结构/);
});

test("换装严格隔离双图职责且只允许修改服装区域",()=>{
  const prompt=tryonPrompt("裤装","垂感阔腿裤","保持腰头、侧缝和裤脚");
  assert.match(prompt,/双图隔离硬规则/);
  assert.match(prompt,/服装产品图中的人物、模特、人体、衣架、手、道具、文字、背景/);
  assert.match(prompt,/模特参考图中除原服装以外的全部可见内容必须保持/);
  assert.match(prompt,/唯一允许修改区域/);
  assert.match(prompt,/不得重绘、重构、美化、移动或替换/);
  assert.match(prompt,/不得残留其领口、袖口、下摆、颜色、花纹、材质、轮廓或任何设计痕迹/);
  assert.match(prompt,/肩斜、袖窿、袖山、落肩位置、省道、分割线、拼接线/);
  assert.match(prompt,/裆深、前后裆线、内侧缝、外侧缝/);
  assert.match(prompt,/任何一项不满足都视为失败，必须重新生成/);
  assert.match(prompt,/人物身份绝对锁定/);
  assert.match(prompt,/不得以产品图人物作为输出主体/);
});

test("复色提示词只提取颜色且禁止复制参考图款式",()=>{
  const prompt=recolorPrompt("裙子","焦糖色","#C8A06A",["印花"],"保持背景",false,"白色","#FFFFFF");
  assert.match(prompt,/只提取颜色本身/);
  assert.match(prompt,/严禁从参考图复制服装款式/);
  assert.match(prompt,/#C8A06A/);
  assert.match(prompt,/边饰颜色：白色（#FFFFFF）/);
  assert.match(prompt,/色块布局/);
  assert.match(prompt,/不得新增、删除或移动色块/);
  assert.match(prompt,/不得保留原主体颜色/);
  assert.match(prompt,/没有真正改变目标服装主体颜色必须视为生成失败/);
  assert.match(prompt,/面料材质、织法\/针法/);
  assert.match(prompt,/渐变方向、层次和过渡边界/);
});

test("复色区域由商品类型锁定，上衣不得改动下装",()=>{
  assert.equal(recolorAreaForProductType("上衣"),"上衣");
  assert.equal(recolorAreaForProductType("裤装"),"裤子");
  assert.equal(recolorAreaForProductType("半身裙"),"裙子");
  const prompt=recolorPrompt("上衣","深咖啡色","#432E28",[],"");
  assert.match(prompt,/绝对不得改色的其他服饰：裤子、裙子/);
  assert.match(prompt,/颜色、材质、纹理、阴影和亮度/);
});
