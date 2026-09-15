import "server-only";
import { z } from "zod";
import type { GarmentConsistencyCheck, Job, Project } from "@/lib/db";
import { localImage, toDataUrl } from "./storage";
import { resolveQcModel } from "./provider-settings";
import { requestMultiVisionJson } from "./vision-chat";
import { garmentConsistencyPrompt } from "./prompts/consistency";
import { resizeToJpeg } from "../image-limits";
import { resolveRecolorConsistencyStatus } from "../recolor-structure";
import { resolveTryonDetailStatus } from "../garment-detail-lock";
import { resolveRecolorReferenceEvidence } from "../recolor-reference-source";

const checkSchema = z.object({
  consistent: z.boolean(),
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
  checks: z.object({
    singleSourceGarment: z.boolean().optional().default(false),
    silhouette: z.boolean(),
    material: z.boolean(),
    texture: z.boolean(),
    construction: z.boolean(),
    details: z.boolean(),
    color: z.boolean(),
    buttons: z.boolean().optional().default(true),
    pockets: z.boolean().optional().default(true),
    stripesTrimStitching: z.boolean().optional().default(true),
    graphics: z.boolean().optional().default(true),
    necklineSleeveHem: z.boolean().optional().default(true),
    symmetry: z.boolean().optional().default(true),
    extraDesigns: z.boolean().optional().default(true),
    missingDesigns: z.boolean().optional().default(true),
    colorMapping: z.boolean().optional(),
    regionIsolation: z.boolean().optional(),
    person: z.boolean().optional(),
    composition: z.boolean().optional(),
    occlusion: z.boolean().optional(),
  }),
  repairTargets: z
    .array(
      z.object({
        type: z.enum([
          "buttons",
          "pockets",
          "stripes",
          "trim",
          "stitching",
          "print",
          "embroidery",
          "paneling",
          "neckline",
          "sleeve",
          "hem",
          "fabric",
          "other",
        ]),
        description: z.string().min(1).max(300),
        boundingBox: z
          .object({
            x: z.coerce.number().min(0).max(1),
            y: z.coerce.number().min(0).max(1),
            width: z.coerce.number().positive().max(1),
            height: z.coerce.number().positive().max(1),
          })
          .optional(),
        confidence: z.coerce.number().min(0).max(1),
      }),
    )
    .max(8)
    .default([]),
});

async function compactImage(url: string) {
  const input = await localImage(url);
  return toDataUrl(await resizeToJpeg(input, 1024, 82), "image/jpeg");
}

export async function checkGarmentConsistency(
  project: Project,
  job: Job,
): Promise<GarmentConsistencyCheck> {
  if (!["tryon", "pose", "recolor"].includes(job.workflow))
    throw new Error("当前生成结果不支持服装一致性检测");
  const output = job.outputImages[0];
  if (!output) throw new Error("该任务还没有可检测的生成结果");
  const posePersonSource =
    job.workflow === "pose"
      ? job.sourceModelImage ||
        job.inputImages[0] ||
        project.confirmedTryonImage
      : undefined;
  const poseGarmentSource =
    job.workflow === "pose" ? project.assets.garmentImage : undefined;
  const source =
    job.workflow === "recolor"
      ? job.sourceModelImage ||
        job.inputImages[0] ||
        project.confirmedPoseImages?.[(job.slot || 1) - 1]
      : job.workflow === "tryon"
        ? project.garmentDetailLock?.sourceImage ||
          project.assets.garmentCropImage ||
          project.assets.garmentImage ||
          job.inputImages[1]
        : poseGarmentSource || posePersonSource;
  if (!source)
    throw new Error("找不到原产品服装基准图，请先保留产品图或输入图");
  if (job.workflow === "pose" && !posePersonSource)
    throw new Error("找不到三姿势使用的人物底图，无法检查模特身份");
  const variantReferences =
    job.workflow === "recolor"
      ? (() => {
          const color = project.targetColors?.find(
            (item) => item.id === job.targetColorId,
          );
          return resolveRecolorReferenceEvidence(color).images;
        })()
      : [];
  if (job.workflow === "recolor" && !variantReferences.length)
    throw new Error(
      "找不到当前颜色款的整件服装设计参考，无法进行一对一复色质检",
    );
  const runtime = await resolveQcModel();
  const tryonDetailReferences =
    job.workflow === "tryon"
      ? job.detailReferenceImages ||
        project.garmentDetailLock?.detailReferences ||
        []
      : [];
  const inputs =
    job.workflow === "recolor"
      ? [source, ...variantReferences, output]
      : job.workflow === "tryon"
        ? [
            source,
            ...tryonDetailReferences.map((reference) => reference.image),
            output,
          ]
        : job.workflow === "pose" && poseGarmentSource
          ? [poseGarmentSource, posePersonSource!, output]
          : [source, output];
  const parsed = checkSchema.parse(
    await requestMultiVisionJson(
      runtime,
      await Promise.all(inputs.map(compactImage)),
      "你是严格的电商服装质检员。必须基于可见证据判断，不得因人物姿势或背景不同而误判。",
      garmentConsistencyPrompt(
        job.workflow as "tryon" | "pose" | "recolor",
        project,
        job,
      ),
    ),
  );
  const recolorChecks = {
    ...parsed.checks,
    colorMapping: parsed.checks.colorMapping ?? false,
    regionIsolation: parsed.checks.regionIsolation ?? false,
    person: parsed.checks.person ?? false,
    composition: parsed.checks.composition ?? false,
    occlusion: parsed.checks.occlusion ?? false,
  };
  const status =
    job.workflow === "recolor"
      ? resolveRecolorConsistencyStatus({
          consistent: parsed.consistent,
          score: parsed.score,
          checks: recolorChecks,
        })
      : job.workflow === "tryon"
        ? resolveTryonDetailStatus({
            consistent: parsed.consistent,
            score: parsed.score,
            checks: {
              singleSourceGarment: parsed.checks.singleSourceGarment,
              silhouette: parsed.checks.silhouette,
              material: parsed.checks.material,
              texture: parsed.checks.texture,
              construction: parsed.checks.construction,
              details: parsed.checks.details,
              color: parsed.checks.color,
              buttons: parsed.checks.buttons,
              pockets: parsed.checks.pockets,
              stripesTrimStitching: parsed.checks.stripesTrimStitching,
              graphics: parsed.checks.graphics,
              necklineSleeveHem: parsed.checks.necklineSleeveHem,
              symmetry: parsed.checks.symmetry,
              extraDesigns: parsed.checks.extraDesigns,
              missingDesigns: parsed.checks.missingDesigns,
            },
          })
        : parsed.checks.person === false
          ? "failed"
          : parsed.consistent &&
              parsed.checks.person === true &&
              parsed.score >= 85
            ? "passed"
            : "needs_review";
  return {
    status,
    score: Math.round(parsed.score),
    summary: parsed.summary,
    issues: parsed.issues,
    repairTargets: job.workflow === "tryon" ? parsed.repairTargets : undefined,
    checks: job.workflow === "recolor" ? recolorChecks : parsed.checks,
    checkedAt: new Date().toISOString(),
    model: runtime.model,
  };
}
