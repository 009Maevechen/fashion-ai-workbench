import "server-only";
import sharp from "sharp";
import { z } from "zod";
import type { Job, Project } from "@/lib/db";
import { localImage, toDataUrl } from "./storage";
import { resolveQcModel } from "./provider-settings";
import { requestMultiVisionJson } from "./vision-chat";

const schema = z.object({
  basedOnModel: z.boolean(),
  poseMatch: z.boolean(),
  shotMatch: z.boolean(),
  closerToProduct: z.boolean(),
  score: z.coerce.number().min(0).max(100),
  summary: z.string().min(1).max(500),
  issues: z.array(z.string().min(1).max(200)).max(12).default([]),
});

export type TryonSubjectFidelity = {
  status: "passed" | "needs_review" | "failed";
  basedOnModel: boolean;
  poseMatch: boolean;
  shotMatch: boolean;
  closerToProduct: boolean;
  score: number;
  summary: string;
  issues: string[];
  checkedAt: string;
  model?: string;
};

async function compactImage(url: string) {
  const input = await localImage(url);
  return toDataUrl(
    await sharp(input)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer(),
    "image/jpeg",
  );
}

/**
 * 换装主体保真校验：判断生成结果是否真正把产品服装穿到了参考模特身上，
 * 而不是沿用产品图的展示方式（人物、姿势、景别、构图来自产品图）。
 * 图片顺序：第1张=参考模特图，第2张=服装产品图，第3张=生成结果图。
 */
export async function checkTryonSubjectFidelity(
  project: Project,
  job: Job,
): Promise<TryonSubjectFidelity> {
  const output = job.outputImages[0];
  if (!output) throw new Error("该任务还没有可检测的生成结果");
  const modelImage =
    project.assets.modelReferenceImage ||
    project.assets.modelImage ||
    job.inputImages[0];
  const garmentImage = project.assets.garmentImage || job.inputImages[1];
  if (!modelImage) throw new Error("找不到参考模特图，无法校验换装主体");
  if (!garmentImage) throw new Error("找不到服装产品图，无法校验换装主体");

  const runtime = await resolveQcModel();
  const parsed = schema.parse(
    await requestMultiVisionJson(
      runtime,
      await Promise.all([
        compactImage(modelImage),
        compactImage(garmentImage),
        compactImage(output),
      ]),
      "你是严格的电商服装换装质检员。必须基于可见证据判断，不得猜测。核心判断：生成结果里的“人”是否就是参考模特图里的那个人（同一个人、同一个姿势、同一个景别），只是衣服换成了产品图的服装。",
      `图片顺序：第1张是参考模特图，第2张是服装产品图，第3张是生成结果图。\n` +
        `判断要点：\n` +
        `1. 第3张结果里的模特形象、姿势、身体姿态、站位、景别（全身/半身/特写）、镜头视角、构图，是否与第1张参考模特图一致或高度接近？\n` +
        `2. 第3张结果是否更像是“第2张产品图”的商品展示方式（人物、姿势、展示方式、构图沿用了产品图，而不是把服装穿到参考模特身上）？\n` +
        `3. 服装本身是否来自第2张产品图？\n` +
        `判定规则：如果结果更像产品图（人物/姿势/景别/构图来自产品图，而不是参考模特图），closerToProduct 必须为 true，basedOnModel 必须为 false，score 必须低于 60。看不清人物姿势或景别时，issues 里说明并降低 score，不得臆断。\n` +
        `返回 JSON：{"basedOnModel":boolean,"poseMatch":boolean,"shotMatch":boolean,"closerToProduct":boolean,"score":0到100,"summary":"中文结论","issues":["具体问题"]}`,
    ),
  );

  const status: TryonSubjectFidelity["status"] =
    parsed.closerToProduct || !parsed.basedOnModel
      ? "failed"
      : parsed.basedOnModel && parsed.score >= 80
        ? "passed"
        : "needs_review";

  return {
    status,
    basedOnModel: parsed.basedOnModel,
    poseMatch: parsed.poseMatch,
    shotMatch: parsed.shotMatch,
    closerToProduct: parsed.closerToProduct,
    score: Math.round(parsed.score),
    summary: parsed.summary,
    issues: parsed.issues,
    checkedAt: new Date().toISOString(),
    model: runtime.model,
  };
}
