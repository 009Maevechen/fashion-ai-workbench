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
  assert.match(prompt,/模特参考图里的服装只是需要被彻底移除的遮挡物/);
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
  assert.match(prompt,/彻底去除模特原服装/);
  assert.match(prompt,/全部作废、全部删除、全部不得保留/);
  assert.match(prompt,/任何原服装残留、颜色渗入或结构混入都必须判定为失败并重试/);
  assert.match(prompt,/产品图是结果的唯一服装来源/);
  assert.match(prompt,/不得让模特原服装的任何特征出现在结果里/);
  assert.match(prompt,/扣子与小五金重点强化/);
  assert.match(prompt,/扣子数量——产品图有几颗就生成几颗/);
  assert.match(prompt,/单排扣、双排扣、明门襟、暗门襟/);
  assert.match(prompt,/扣子不得出现漂浮、歪斜、糊掉、消失、变形、错位/);
});

test("复色提示词按颜色款一对一复刻设计且保持人物原样",()=>{
  const prompt=recolorPrompt("裙子","焦糖色","#C8A06A",["印花"],"保持背景",false,"白色","#FFFFFF");
  assert.match(prompt,/颜色款一对一复刻规则/);
  assert.match(prompt,/第二张图片是当前这一个颜色款的整件服装设计参考/);
  assert.match(prompt,/每个颜色款必须分别读取自己的第二张参考图/);
  assert.match(prompt,/口袋、条纹、拼接、扣子、印花、包边/);
  assert.match(prompt,/#C8A06A/);
  assert.match(prompt,/边饰颜色：白色（#FFFFFF）/);
  assert.match(prompt,/线条位置或面料分区时必须同步还原/);
  assert.match(prompt,/第二张图没有的设计不得沿用其他色款/);
  assert.match(prompt,/不得保留原主体颜色/);
  assert.match(prompt,/没有真正改变目标服装主体颜色必须视为生成失败/);
  assert.match(prompt,/面料类别、织法\/针法/);
  assert.match(prompt,/厚薄、光泽、垂感和褶皱响应必须前后一致/);
  assert.match(prompt,/渐变方向、层次和过渡边界/);
  assert.match(prompt,/禁止裁剪服装 · 最高优先规则/);
  assert.match(prompt,/只能扩展背景，绝对不能裁切人物或服装/);
  assert.match(prompt,/服装所有可见边缘均未被新画面边界裁掉/);
  assert.match(prompt,/露脸与原图样式锁定/);
  assert.match(prompt,/有脸就保留同一张脸/);
  assert.match(prompt,/没有脸就不得补画/);
});

test("复色区域由商品类型锁定，上衣不得改动下装",()=>{
  assert.equal(recolorAreaForProductType("上衣"),"上衣");
  assert.equal(recolorAreaForProductType("裤装"),"裤子");
  assert.equal(recolorAreaForProductType("半身裙"),"裙子");
  const prompt=recolorPrompt("上衣","深咖啡色","#432E28",[],"");
  assert.match(prompt,/绝对不得改色的其他服饰：裤子、裙子/);
  assert.match(prompt,/背景、皮肤、头发、鞋子、道具/);
});

test("统一复色只换颜色，单件复色按颜色款一对一复刻设计",()=>{
  const uniform=recolorPrompt("上衣","黑色","#000000",["背景"],"保持结构",false,"","",[],"","","uniform");
  assert.match(uniform,/统一复色/);
  assert.match(uniform,/统一复色规则/);
  assert.match(uniform,/只替换目标服装区域的颜色/);
  assert.doesNotMatch(uniform,/颜色款一对一复刻规则/);
  const perVariant=recolorPrompt("上衣","黑色","#000000",["背景"],"保持结构",false,"","",[],"","","perVariant");
  assert.match(perVariant,/颜色款一对一复刻规则/);
  assert.doesNotMatch(perVariant,/统一复色规则/);
  // 两种模式都必须保证同一颜色款内多张图设计一致，不允许某张多一块少一块。
  assert.match(uniform,/同款颜色设计一致性/);
  assert.match(perVariant,/同款颜色设计一致性/);
  assert.match(uniform,/不允许多一块少一块/);
});

test("复色以参考图为唯一主要依据，名称和HEX不能覆盖图片",()=>{
  const prompt=recolorPrompt("裤子","标题写红色","#FF0000",["背景"],"",false,"","",["黑白侧条纹"],"细密梭织","标题辅助规则","perVariant",[
    {part:"主体",colorName:"橄榄绿",hex:"#556B2F",confidence:.94},
    {part:"侧条纹",colorName:"白色",hex:"#FFFFFF",confidence:.91},
  ]);
  assert.match(prompt,/唯一主要依据/);
  assert.match(prompt,/名称、标题和HEX只能帮助定位\/命名/);
  assert.match(prompt,/文字与第二张参考图冲突，必须完全以第二张参考图为准/);
  assert.match(prompt,/主体=橄榄绿\(#556B2F\)/);
  assert.match(prompt,/侧条纹=白色\(#FFFFFF\)/);
  assert.doesNotMatch(prompt,/颜色名称就是生成规则/);
});

test("遮挡区域只有明确统一单色时才允许延展",()=>{
  const safe=recolorPrompt("裤子","绿色","#556B2F",[],"",false,"","",[],"","","perVariant",[],true,.91,"partial","extend_uniform","裤腿被折叠");
  assert.match(safe,/确认整件服装为统一单色/);
  assert.match(safe,/仅允许遮挡区域延续参考图可见的同一主体色/);
  const review=recolorPrompt("裤子","绿色","#556B2F",[],"",false,"","",["黑白侧条纹"],"","","perVariant",[],false,.4,"partial","visible_only","侧边被遮挡");
  assert.match(review,/禁止对不可见区域猜色或自动同色延展/);
  assert.match(review,/进入人工审核/);
});
