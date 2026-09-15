import test from "node:test";
import assert from "node:assert/strict";
import type { Job, Project } from "../src/lib/db";
import { garmentConsistencyPrompt } from "../src/lib/ai/prompts/consistency";

const project = {
  profile: { attributes: { fabric: "针织", fabricTexture: "罗纹" } },
  targetColors: [
    {
      id: "brown",
      name: "深卡其色",
      outputName: "深卡其色黑色扣子",
      hex: "#8B7355",
      trimColorName: "黑边",
      trimHex: "#101010",
      structureMode: "same_style",
      styleRelation: "same",
    },
  ],
} as Project;
const job = { targetColorId: "brown", colorName: "深卡其色" } as Job;

test("姿势一致性允许动作变化但严格锁定人物身份与服装", () => {
  const prompt = garmentConsistencyPrompt("pose", project, job);
  assert.match(prompt, /结果必须是人物底图中的同一个真人/);
  assert.match(prompt, /姿势改变不等于允许换人/);
  assert.match(prompt, /不得复制姿势参考图中的人物/);
  assert.match(prompt, /checks.person 必须为 false/);
  assert.match(prompt, /面料材质/);
  assert.match(prompt, /织法与纹理/);
  assert.doesNotMatch(prompt, /"repairTargets"/);
});

test("换装一致性以原产品服装为基准并忽略模特差异", () => {
  const prompt = garmentConsistencyPrompt("tryon", project, job);
  assert.match(prompt, /这是服装换装候选图/);
  assert.match(
    prompt,
    /服装类型、版型、材质、面料、纹理、颜色、包边和全部设计细节完全一致/,
  );
  assert.match(prompt, /模特、姿势、构图和背景差异不算服装不一致/);
  assert.match(prompt, /结果只能对应其中同一件、同一颜色款/);
  assert.match(prompt, /"singleSourceGarment":boolean/);
  assert.match(prompt, /"repairTargets"/);
});

test("复色一致性以第一张锁款式、第二张提供颜色映射", () => {
  const prompt = garmentConsistencyPrompt("recolor", project, job);
  assert.match(prompt, /深卡其色/);
  assert.match(prompt, /#8B7355/);
  assert.doesNotMatch(prompt, /黑边/);
  assert.match(
    prompt,
    /第1张已确认姿势图是人物、姿势、动作、景别、构图、背景、画面样式、服装版型、结构、面料、纹理、垂感、扣子五金和全部颜色区域布局的唯一底图/,
  );
  assert.match(prompt, /第2张是当前颜色款参考图，只负责提供普通颜色款的主体色/);
  assert.match(prompt, /当前颜色款没有获准改变结构/);
  assert.match(prompt, /扣子\/五金颜色仍以第1张为准/);
  assert.match(prompt, /任何未获准款式变化、颜色错位、非服装区域误改/);
  assert.match(prompt, /\"colorMapping\":boolean/);
  assert.match(prompt, /\"regionIsolation\":boolean/);
  assert.doesNotMatch(prompt, /"repairTargets"/);
});

test("复色质检只使用当前颜色款的多张独立参考图", () => {
  const independentProject = {
    ...project,
    targetColors: [
      {
        ...project.targetColors![0],
        referenceImages: [
          {
            id: "primary",
            path: "/api/files/brown-main.jpg",
            hash: "1",
            role: "primary",
            isPrimary: true,
            uploadedAt: "2026-09-15T00:00:00.000Z",
          },
          {
            id: "detail",
            path: "/api/files/brown-detail.jpg",
            hash: "2",
            role: "supporting",
            isPrimary: false,
            uploadedAt: "2026-09-15T00:00:00.000Z",
          },
        ],
      },
    ],
  } as Project;
  const prompt = garmentConsistencyPrompt("recolor", independentProject, job);
  assert.match(prompt, /第2至第3张是当前颜色款参考图/);
  assert.match(prompt, /第4张是复色结果图/);
  assert.match(prompt, /完全忽略 SKU 级多色参考图/);
});
