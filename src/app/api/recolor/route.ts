import { NextResponse } from "next/server";
import { enqueueWorkflow } from "@/lib/job-runner";
import { getProject } from "@/lib/db";
import { recolorColorName } from "@/lib/color-sets";
import { z } from "zod";
import { assertFormalImageSource } from "@/lib/image-sources";
import { recolorAreaForProductType } from "@/lib/recolor-scope";
import { normalizeTryonDetailRequirements } from "@/lib/tryon-detail-requirements";
import { resolveRecolorReferenceEvidence } from "@/lib/recolor-reference-source";
const image = z.string().startsWith("/api/files/");
const optionalHex = z
  .string()
  .max(7)
  .refine(
    (value) => !value || /^#[0-9A-Fa-f]{6}$/.test(value),
    "颜色色号必须是 6 位 HEX，例如 #C8A06A",
  );
const schema = z.object({
  projectId: z.string().uuid(),
  colorReferenceImage: image.optional(),
  colorReferenceCrop: image.optional(),
  referenceImages: z.array(image).min(1).max(6).optional(),
  targetColorId: z.string().uuid().optional(),
  colorName: z.string().trim().min(1, "请先为当前颜色命名").max(60),
  hexColor: optionalHex,
  trimColorName: z.string().trim().max(30).optional().default(""),
  trimHex: optionalHex.optional().default(""),
  garmentArea: z.enum(["上衣", "裤子", "裙子", "整套服装"]),
  protectedAreas: z.array(z.string()).max(20),
  extraRequirements: z
    .string()
    .max(10000)
    .transform((value) => normalizeTryonDetailRequirements(value, 2000)),
  face: z.boolean().default(false),
  mode: z.enum(["fast", "standard", "quality"]),
  sourceMode: z.enum(["confirmed", "standalone"]).optional(),
  poseImages: z.array(image).min(2).max(4).optional(),
  withModelImage: z.boolean().optional(),
  recolorMode: z.enum(["uniform", "perVariant"]).optional(),
  slot: z.number().int().min(1).max(4).optional(),
  modelPreference: z.enum(["primary", "fallback"]).optional(),
  idempotencyKey: z.string().max(200).optional(),
});
export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json()),
      project = await getProject(input.projectId);
    if (!project) throw new Error("项目不存在");
    const normalized = input.colorName.toLocaleLowerCase("zh-CN"),
      duplicated = (project.targetColors || []).some(
        (color) =>
          color.id !== input.targetColorId &&
          recolorColorName(color).toLocaleLowerCase("zh-CN") === normalized,
      );
    if (duplicated)
      throw new Error(`颜色名称“${input.colorName}”已经存在，请使用不同名称`);
    const targetColor = (project.targetColors || []).find(
      (color) => color.id === input.targetColorId,
    );
    const evidence = resolveRecolorReferenceEvidence(
      targetColor,
      input.colorReferenceCrop,
    );
    // 旧共享大图的待确认状态不得拦截用户后来单独上传的当前色款参考图。
    if (
      evidence.mode === "shared" &&
      targetColor?.designNeedsReview &&
      !targetColor.manualReviewConfirmed
    )
      throw new Error(
        `颜色款“${input.colorName}”存在遮挡或低置信度信息，请先人工确认参考图规则`,
      );
    if (!evidence.images.length)
      throw new Error(
        "当前颜色款缺少颜色依据：可单独上传该颜色款参考图，或先从共享颜色参考图建立该色款",
      );
    evidence.images.forEach((url) =>
      assertFormalImageSource(url, "复色颜色参考"),
    );
    const poseImages =
      input.sourceMode === "standalone"
        ? project.assets.standaloneRecolorPoseImages
        : undefined;
    poseImages?.forEach((url, index) =>
      assertFormalImageSource(url, `复色姿势${index + 1}源图`),
    );
    const isIndependent = evidence.mode === "independent";
    const scopedInput = {
      ...input,
      // 独立参考图存在时绝不再把 SKU 级多色图或旧共享裁图传给生成服务。
      colorReferenceImage: isIndependent
        ? evidence.primaryImage
        : project.assets.colorReferenceImage,
      colorReferenceCrop: isIndependent ? undefined : evidence.primaryImage,
      referenceImages: evidence.images,
      variantReferenceMode: evidence.mode,
      variantPromptColorName: evidence.promptColorName,
      variantPromptHex: evidence.promptHex,
      variantColorMap: evidence.colorMap,
      poseImages,
      recolorMode: "perVariant" as const,
      garmentArea: recolorAreaForProductType(project.productType),
      variantDesignDetails: evidence.designDetails,
      variantMaterialFeatures: evidence.materialFeatures,
      variantColorRegions: isIndependent ? [] : targetColor?.colorRegions || [],
      variantUniformColor: isIndependent
        ? false
        : targetColor?.isUniformColor || false,
      variantUniformColorConfidence: isIndependent
        ? 0
        : targetColor?.uniformColorConfidence || 0,
      variantOcclusion: isIndependent
        ? "none"
        : targetColor?.occlusion || "none",
      variantOcclusionPolicy: isIndependent
        ? "visible_only"
        : targetColor?.occlusionPolicy || "visible_only",
      variantOcclusionReason: isIndependent
        ? ""
        : targetColor?.occlusionReason || "",
      variantStructureMode: evidence.structureMode,
      variantStructureDifferences: evidence.structureDifferences,
      variantStructureDifferenceConfidence:
        evidence.structureDifferenceConfidence,
      variantMainColorAuthority: evidence.mainColorAuthority,
    };
    const operation = await enqueueWorkflow(
      "recolor",
      scopedInput,
      input.idempotencyKey,
    );
    return NextResponse.json(
      { jobId: operation.id, status: operation.status },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "复色失败" },
      { status: 400 },
    );
  }
}
