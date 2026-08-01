import test from "node:test";
import assert from "node:assert/strict";
import {POSE_PROMPT_VERSION,posePrompt} from "../src/lib/ai/prompts/pose";

test("姿势生成使用严格参考模板且参考图优先于文字",()=>{
  const prompt=posePrompt("自然站立","上衣","全身",false,true,"保持衣长");
  assert.equal(POSE_PROMPT_VERSION,"pose-v3-strict-reference");
  assert.match(prompt,/第二张输入图是强制姿势模板/);
  assert.match(prompt,/参考图有任何冲突，以第二张参考图为唯一标准/);
  assert.match(prompt,/不得左右镜像/);
  assert.match(prompt,/严格复制左右手臂、肘部、手腕和手掌/);
  assert.match(prompt,/严格复制骨盆方向、左右腿位置、膝盖和脚踝角度/);
});
