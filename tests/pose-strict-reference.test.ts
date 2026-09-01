import test from "node:test";
import assert from "node:assert/strict";
import {POSE_PROMPT_VERSION,posePrompt} from "../src/lib/ai/prompts/pose";

test("姿势生成使用严格参考模板且参考图优先于文字",()=>{
  const prompt=posePrompt("自然站立","上衣","全身",false,true,"保持衣长");
  assert.equal(POSE_PROMPT_VERSION,"pose-v6-garment-source-priority");
  assert.match(prompt,/最后一张“姿势参考图”/);
  assert.match(prompt,/与姿势参考图有冲突，以姿势参考图为准/);
  assert.match(prompt,/不得左右镜像/);
  assert.match(prompt,/严格复制左右手臂、肘部、手腕和手掌/);
  assert.match(prompt,/严格复制骨盆方向、左右腿位置、膝盖和脚踝角度/);
  assert.match(prompt,/不得拉远、拉近、扩图、补全身体/);
  assert.match(prompt,/页面设置或模型默认构图与姿势参考图有冲突/);
  assert.match(prompt,/必须忽略此文字并一比一复制参考图实际景别/);
  assert.match(prompt,/服装材质与设计拥有与姿势同等的强制优先级/);
  assert.match(prompt,/织法\/针法、罗纹或纹理方向与密度/);
  assert.match(prompt,/渐变方向与过渡范围、色块边界与比例/);
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
