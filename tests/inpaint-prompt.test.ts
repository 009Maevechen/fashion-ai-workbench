import test from "node:test";
import assert from "node:assert/strict";
import { inpaintPrompt, INPAINT_PROMPT_VERSION } from "../src/lib/ai/prompts/inpaint";

test("局部重绘提示词只修改蒙版选中区域", () => {
  const prompt = inpaintPrompt("把这个口袋去掉", "这是服装换装结果图");
  assert.equal(INPAINT_PROMPT_VERSION, "inpaint-v3-strict-mask-lock");
  assert.match(prompt, /只修改用户选中的区域/);
  assert.match(prompt, /Mask 之外的所有区域/);
  assert.match(prompt, /默认全部锁定/);
  assert.match(prompt, /把这个口袋去掉/);
  assert.match(prompt, /只改选中区域/);
  assert.match(prompt, /不得因为局部修改而重画整张图/);
  assert.match(prompt, /输出宽高分辨率不得降低/);
  assert.match(prompt, /禁止因反复修改造成逐代模糊/);
  assert.match(prompt, /禁止自由发挥/);
  assert.match(prompt, /真实生效/);
});

test("局部重绘提示词保留人物姿势景别与整体样式", () => {
  const prompt = inpaintPrompt("把裤脚改宽一点", "这是三姿势结果图。局部修改时仍须保持该姿势、人物和景别不变");
  assert.match(prompt, /这是三姿势结果图/);
  assert.match(prompt, /把裤脚改宽一点/);
  assert.match(prompt, /改变人物身份或姿势/);
  assert.match(prompt, /边缘过渡自然/);
  assert.match(prompt, /真实皮肤毛孔与光泽/);
  assert.match(prompt, /每次只输出一张独立图片/);
});
