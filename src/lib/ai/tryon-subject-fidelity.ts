import "server-only";
import { z } from "zod";
import type { Job, Project } from "@/lib/db";
import { localImage, toDataUrl } from "./storage";
import { resolveQcModel } from "./provider-settings";
import { requestMultiVisionJson } from "./vision-chat";
import { resizeToJpeg } from "../image-limits";

const schema = z.object({
  basedOnModel: z.boolean(),
  poseMatch: z.boolean(),
  shotMatch: z.boolean(),
  compositionMatch: z.boolean(),
  cameraAngleMatch: z.boolean(),
  backgroundMatch: z.boolean(),
  lightingMatch: z.boolean(),
  faceVisibilityMatch: z.boolean(),
  closerToProduct: z.boolean(),
  productPersonLeak: z.boolean(),
  originalGarmentLeak: z.boolean(),
  skinQualityMatch: z.boolean(),
  artificialArtifacts: z.boolean(),
  score: z.coerce.number().min(0).max(100),
  summary: z
    .string()
    .min(1)
    .max(2000)
    .transform((value) => value.trim().slice(0, 500)),
  issues: z
    .array(
      z
        .string()
        .min(1)
        .max(1000)
        .transform((value) => value.trim().slice(0, 200)),
    )
    .max(12)
    .default([]),
});

export type TryonSubjectFidelity = {
  status: "passed" | "needs_review" | "failed";
  basedOnModel: boolean;
  poseMatch: boolean;
  shotMatch: boolean;
  compositionMatch: boolean;
  cameraAngleMatch: boolean;
  backgroundMatch: boolean;
  lightingMatch: boolean;
  faceVisibilityMatch: boolean;
  closerToProduct: boolean;
  productPersonLeak: boolean;
  originalGarmentLeak: boolean;
  skinQualityMatch: boolean;
  artificialArtifacts: boolean;
  score: number;
  summary: string;
  issues: string[];
  checkedAt: string;
  model?: string;
};

async function compactImage(url: string) {
  const input = await localImage(url);
  return toDataUrl(await resizeToJpeg(input, 1024, 82), "image/jpeg");
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
  const garmentImage = job.inputImages[1] || project.assets.garmentImage;
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
      "你是严格的电商服装换装质检员。必须基于可见证据判断，不得猜测。核心判断有四点：生成结果里的“人”是否就是参考模特图里的那个人（同一个人、同一个姿势、同一个景别）；结果服装是否只来自产品图；结果服装是否残留了参考模特原服装的特征；结果的皮肤质感与画质是否明显低于参考模特图。",
      `图片顺序：第1张是参考模特图，第2张是服装产品图，第3张是生成结果图。\n` +
        `判断要点：\n` +
        `1. 第3张结果里的模特形象、姿势、身体姿态、站位、景别（全身/半身/特写）、镜头视角、构图，是否与第1张参考模特图一致或高度接近？\n` +
        `2. 第3张结果是否更像是“第2张产品图”的商品展示方式（人物、姿势、展示方式、构图沿用了产品图，而不是把服装穿到参考模特身上）？\n` +
        `3. 第3张结果里的服装，其款式、颜色、面料、版型、领型、袖型、下摆、细节，是否完全来自第2张产品图？\n` +
        `4. 关键：第3张结果里的服装，是否残留或混入了第1张参考模特原本穿着的服装特征（原服装的颜色、版型、面料、纹理、领口、袖口、下摆、轮廓等）？只要结果服装带有任何一点模特原服装特征，originalGarmentLeak 必须为 true。\n` +
        `5. 分别检查第3张的构图与人物位置、相机角度、背景、光线阴影、露脸/不露脸状态是否与第1张一致。\n` +
        `6. 检查第3张是否混入第2张产品图中的人物、身体、脸、姿势、背景或展示构图；只要存在，productPersonLeak=true。\n` +
        `7. 皮肤与画质：第3张结果人物的肤色、皮肤质感、光泽感、细腻度和整体画质，是否明显低于第1张参考模特图（肤色偏差、皮肤发灰、假白、塑料感、磨皮过度、脏感、涂抹感、噪点、模糊、低清）？若明显低于参考图，skinQualityMatch 必须为 false。\n` +
        `8. 检查错位、畸形、粘连、重复肢体、边缘破损、杂质、光晕和明显AI纹理；任一可见异常则 artificialArtifacts=true。\n` +
        `判定规则：如果结果更像产品图（人物/姿势/景别/构图来自产品图而非参考模特图），closerToProduct 必须为 true，basedOnModel 必须为 false；如果结果服装混入了模特原服装特征，originalGarmentLeak 必须为 true；如果皮肤质感或画质明显低于参考图，skinQualityMatch 必须为 false。这些情况 score 都必须低于 60。看不清时在 issues 里说明并降低 score，不得臆断。\n` +
        `返回 JSON：{"basedOnModel":boolean,"poseMatch":boolean,"shotMatch":boolean,"compositionMatch":boolean,"cameraAngleMatch":boolean,"backgroundMatch":boolean,"lightingMatch":boolean,"faceVisibilityMatch":boolean,"closerToProduct":boolean,"productPersonLeak":boolean,"originalGarmentLeak":boolean,"skinQualityMatch":boolean,"artificialArtifacts":boolean,"score":0到100,"summary":"中文结论","issues":["具体问题"]}`,
    ),
  );

  // 核心主体错误继续标记为 failed，以便醒目提示并参与后续质量统计；
  // 最终是否采用由用户人工审核决定，确认层不会让 AI 质检替用户作最终裁决。
  const coreFailed =
    parsed.closerToProduct ||
    parsed.productPersonLeak ||
    parsed.originalGarmentLeak ||
    !parsed.basedOnModel ||
    !parsed.poseMatch ||
    !parsed.shotMatch ||
    !parsed.compositionMatch ||
    !parsed.cameraAngleMatch ||
    !parsed.backgroundMatch ||
    !parsed.lightingMatch ||
    !parsed.faceVisibilityMatch;
  const status: TryonSubjectFidelity["status"] = coreFailed
    ? "failed"
    : !parsed.skinQualityMatch ||
        parsed.artificialArtifacts ||
        parsed.score < 85
      ? "needs_review"
      : "passed";

  return {
    status,
    basedOnModel: parsed.basedOnModel,
    poseMatch: parsed.poseMatch,
    shotMatch: parsed.shotMatch,
    compositionMatch: parsed.compositionMatch,
    cameraAngleMatch: parsed.cameraAngleMatch,
    backgroundMatch: parsed.backgroundMatch,
    lightingMatch: parsed.lightingMatch,
    faceVisibilityMatch: parsed.faceVisibilityMatch,
    closerToProduct: parsed.closerToProduct,
    productPersonLeak: parsed.productPersonLeak,
    originalGarmentLeak: parsed.originalGarmentLeak,
    skinQualityMatch: parsed.skinQualityMatch,
    artificialArtifacts: parsed.artificialArtifacts,
    score: Math.round(parsed.score),
    summary: parsed.summary,
    issues: parsed.issues,
    checkedAt: new Date().toISOString(),
    model: runtime.model,
  };
}
