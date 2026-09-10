import "server-only";
import { z } from "zod";
import type { GarmentDetailLock, Project } from "@/lib/db";
import {
  GARMENT_DETAIL_FIELD_KEYS,
  GARMENT_DETAIL_FIELD_LABELS,
  buildGarmentDetailProtectedDetails,
  buildManualGarmentDetailLock,
  collectGarmentDetailReferences,
  garmentDetailSourceSignature,
} from "@/lib/garment-detail-lock";
import { resolveProductAnalysisModel } from "./provider-settings";
import { localImage, toDataUrl } from "./storage";
import { resizeToJpeg } from "../image-limits";
import { requestMultiVisionJson, requestVisionJson } from "./vision-chat";
import { runTryOnVisionAnalysis } from "./tryon-vision-retry";

const fieldSchema = z.object({
  value: z
    .string()
    .min(1)
    .max(600)
    .transform((value) => value.trim().slice(0, 300)),
  confidence: z.coerce.number().min(0).max(1),
  visibility: z.enum(["visible", "not_visible", "not_applicable"]),
  sourceRoles: z.array(z.string().min(1).max(60)).max(6).default([]),
});
const responseSchema = z.object({
  fields: z.record(z.string(), fieldSchema),
  protectedDetails: z
    .array(
      z
        .string()
        .min(1)
        .max(600)
        .transform((value) => value.trim().slice(0, 300)),
    )
    .max(30)
    .default([]),
  issues: z
    .array(
      z
        .string()
        .min(1)
        .max(600)
        .transform((value) => value.trim().slice(0, 300)),
    )
    .max(20)
    .default([]),
});

async function compact(url: string) {
  const source = await localImage(url);
  return toDataUrl(await resizeToJpeg(source, 1400, 88), "image/jpeg");
}

export async function analyzeGarmentDesign(
  project: Project,
  primaryImage: string,
): Promise<GarmentDetailLock> {
  const sourceSignature = garmentDetailSourceSignature(project, primaryImage);
  if (
    project.garmentDetailLock?.version === "garment-detail-lock-v2" &&
    project.garmentDetailLock.sourceSignature === sourceSignature
  )
    return project.garmentDetailLock;
  const manual = buildManualGarmentDetailLock(project, primaryImage);
  let runtime;
  try {
    runtime = await resolveProductAnalysisModel();
  } catch (error) {
    if (manual) return manual;
    throw new Error(
      `无法建立服装细节锁：${error instanceof Error ? error.message : "商品视觉识别模型未配置"}`,
    );
  }
  const detailReferences = collectGarmentDetailReferences(
    project,
    primaryImage,
  );
  const inputs = [
    primaryImage,
    ...detailReferences.map((reference) => reference.image),
  ];
  const roleLines = [
    "第1张=服装产品主依据",
    ...detailReferences.map(
      (reference, index) =>
        `第${index + 2}张=${reference.label}（role=${reference.role}）`,
    ),
  ].join("；");
  const fieldLines = GARMENT_DETAIL_FIELD_KEYS.map(
    (key) => `${key}=${GARMENT_DETAIL_FIELD_LABELS[key]}`,
  ).join("、");
  const prompt = `${roleLines}。\n请逐项提取并锁定核心服装，不要把图片中的模特、下装、饰品、衣架或背景当成商品结构。字段：${fieldLines}。\n多件/多色隔离规则：如果主图同时出现多件服装或同款多个颜色，只能选定一件完整、清晰、与项目商品类型相符的服装；主图若已是用户框选裁图，就只认框内这一件。全部字段必须来自同一件、同一颜色款，严禁把不同颜色款的颜色、扣子、口袋、条纹、包边、面料或结构拼在一起。补充特写只有在确定属于该选定服装时才可使用；有跨款冲突时写入 issues，不得自行融合。\n规则：1）产品主图中选定的单件服装决定整体版型和结构；对应特写对该局部拥有更高精度，冲突时以属于同一件服装的清晰特写为准。2）商品类别、商品子类、版型、廓形、长度必须分开记录。3）扣子必须分别写数量、相对位置、形状；口袋必须分别写数量、位置、形状。4）条纹必须分别写数量和位置；包边、车线、印花、刺绣、拼接必须写数量、方向、相对位置和布局。5）面料必须分别写纹理/织法/厚薄、光泽与垂感，裤装还要写裤型。6）看不到就 visibility=not_visible、value=无法从图片确认，严禁猜测；明确没有则 visibility=not_applicable、value=无。7）sourceRoles 只能填写上述图片 role。8）fields 必须包含全部 ${GARMENT_DETAIL_FIELD_KEYS.length} 个英文键。只返回 JSON：{"fields":{"category":{"value":"...","confidence":0到1,"visibility":"visible|not_visible|not_applicable","sourceRoles":["..."]}},"protectedDetails":["逐项强约束"],"issues":["证据冲突或不可见项"]}`;
  const dataUrls = await Promise.all(inputs.map(compact));
  const raw = await runTryOnVisionAnalysis(() =>
    dataUrls.length > 1
      ? requestMultiVisionJson(
          runtime,
          dataUrls,
          "你是严格的电商服装制版与质检专家。只记录图片真实可见事实，不得补全、设计或猜测。",
          prompt,
        )
      : requestVisionJson(
          runtime,
          dataUrls[0],
          "你是严格的电商服装制版与质检专家。只记录图片真实可见事实，不得补全、设计或猜测。",
          prompt,
        ),
  );
  const parsed = responseSchema.parse(raw);
  const allowedRoles = new Set([
    "garment_primary",
    ...detailReferences.map((reference) => reference.role),
  ]);
  const fields = Object.fromEntries(
    GARMENT_DETAIL_FIELD_KEYS.map((key) => {
      const value = parsed.fields[key] || {
        value: "无法从图片确认",
        confidence: 0,
        visibility: "not_visible" as const,
        sourceRoles: [],
      };
      const sourceRoles = value.sourceRoles.filter((role) =>
        allowedRoles.has(role),
      );
      return [
        key,
        {
          ...value,
          sourceRoles: sourceRoles.length ? sourceRoles : ["garment_primary"],
        },
      ];
    }),
  ) as GarmentDetailLock["fields"];
  const lowConfidence = GARMENT_DETAIL_FIELD_KEYS.filter(
    (key) =>
      fields[key].visibility === "visible" && fields[key].confidence < 0.7,
  );
  const issues = [
    ...new Set([
      ...parsed.issues,
      ...lowConfidence.map(
        (key) => `${GARMENT_DETAIL_FIELD_LABELS[key]}置信度低，需要人工确认`,
      ),
    ]),
  ];
  const lock: GarmentDetailLock = {
    version: "garment-detail-lock-v2",
    status: issues.length || lowConfidence.length ? "needs_review" : "locked",
    sourceImage: primaryImage,
    sourceSignature,
    productType: project.productType,
    fields,
    protectedDetails: parsed.protectedDetails,
    detailReferences,
    issues,
    lockedAt: new Date().toISOString(),
    model: runtime.model,
  };
  // 提前构建一次可执行文本，确保异常数据不会进入生图阶段。
  buildGarmentDetailProtectedDetails(lock);
  return lock;
}

/** 兼容现有 API 名称；新换装管线使用 analyzeGarmentDesign。 */
export const analyzeGarmentDetailLock = analyzeGarmentDesign;
