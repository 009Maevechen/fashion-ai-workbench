import test from "node:test";
import assert from "node:assert/strict";
import {POSE_PROMPT_VERSION,posePrompt} from "../src/lib/ai/prompts/pose";

test("姿势生成使用严格参考模板且姿势参考图优先于文字",()=>{
  const prompt=posePrompt("自然站立","上衣","全身",false,true,"保持衣长");
  assert.equal(POSE_PROMPT_VERSION,"pose-v7-model-shot-scene-focus");
  assert.match(prompt,/最后一张“姿势参考图”/);
  assert.match(prompt,/以姿势参考图的姿势为准/);
  assert.match(prompt,/不得左右镜像/);
  assert.match(prompt,/严格复制左右手臂、肘部、手腕和手掌/);
  assert.match(prompt,/严格复制骨盆方向、左右腿位置、膝盖和脚踝角度/);
  assert.match(prompt,/页面设置或模型默认构图与姿势参考图的姿势动作有冲突/);
  assert.match(prompt,/服装材质与设计拥有与姿势同等的强制优先级/);
  assert.match(prompt,/织法\/针法、罗纹或纹理方向与密度/);
  assert.match(prompt,/渐变方向与过渡范围、色块边界与比例/);
});

test("三种姿势严格按照商品模特图的景别与场景一比一生成",()=>{
  const prompt=posePrompt("自然站立","上衣","全身",false,true,"保持衣长");
  assert.match(prompt,/景别与场景最高优先级规则/);
  assert.match(prompt,/必须严格一比一复刻作为人物基准的“已确认换装图\/商品模特图”/);
  assert.match(prompt,/一律以商品模特图的景别与场景为准/);
  assert.match(prompt,/不得拉近、拉远、扩展背景、更换背景或补全商品模特图画面之外的内容/);
  assert.match(prompt,/一律以商品模特图景别为准/);
});

test("姿势生成支持侧重上半身或下半身重点展示",()=>{
  const upper=posePrompt("自然站立","上衣","全身",false,true,"保持衣长",false,"upper");
  assert.match(upper,/重点展示上半身/);
  assert.match(upper,/突出领口、肩线、袖型、前襟与上半身细节/);
  const lower=posePrompt("自然站立","裤装","全身",false,true,"保持衣长",false,"lower");
  assert.match(lower,/重点展示下半身/);
  assert.match(lower,/突出腰头、裤型或裙型、下摆、裤脚与下半身细节/);
  const none=posePrompt("自然站立","上衣","全身",false,true,"保持衣长");
  assert.doesNotMatch(none,/侧重展示/);
});

test("姿势生成把产品服装原图作为服装唯一来源",()=>{
  const prompt=posePrompt("自然站立","上衣","全身",false,true,"保持衣长",true);
  assert.match(prompt,/产品服装原图/);
  assert.match(prompt,/服装外观的唯一真值、唯一来源和最高优先级依据/);
  assert.match(prompt,/放在所有参考图的主参考位/);
  assert.match(prompt,/服装设计最高优先级规则/);
  assert.match(prompt,/绝对不允许因为参考姿势图而忽略、弱化、替换或改变产品服装原图的服装设计/);
  assert.match(prompt,/在三种姿势下都必须与产品服装原图严格一致/);
});
