import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { validateUpload, sha, safeSegment } from "./ai/validators";
import { localImage, saveOutput, toDataUrl } from "./ai/storage";
import { resizeToJpeg } from "./image-limits";
import { resolveProductAnalysisModel } from "./ai/provider-settings";
import { requestVisionJson } from "./ai/vision-chat";
import type { ColorReferenceImage, ColorVariantColorProfile } from "./db";
import { extractStructuredColors } from "./structured-color";
import { reconcileVariantPrimaryColor } from "./color-variant-map";
export {
  buildColorMap,
  colorVariantAnalysisSignature,
  referenceNeedsReview,
} from "./color-variant-map";

/**
 * 每个颜色款独立保存自己的参考图（高清 master + 预览 preview + 缩略图 thumbnail）。
 * AI 分析与复色只使用 master（path），缩略图仅用于 UI 列表显示。
 */
export async function saveColorReferenceImage(
  sku: string,
  colorId: string,
  file: File,
): Promise<ColorReferenceImage> {
  const master = await validateUpload(file);
  const id = crypto.randomUUID();
  const folder = `source/color-variants/${safeSegment(colorId)}`;
  const path = await saveOutput(sku, folder, `${id}-master.jpg`, master);
  const preview = await resizeToJpeg(master, 1024, 85);
  const previewPath = await saveOutput(
    sku,
    folder,
    `${id}-preview.jpg`,
    preview,
  );
  const thumbnail = await resizeToJpeg(master, 240, 80);
  const thumbnailPath = await saveOutput(
    sku,
    folder,
    `${id}-thumb.jpg`,
    thumbnail,
  );
  return {
    id,
    path,
    previewPath,
    thumbnailPath,
    hash: sha(master),
    role: "supporting",
    isPrimary: false,
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
  };
}

const regionSchema = z.object({
  part: z.string().max(40),
  colorName: z.string().max(60),
  hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});
const profileSchema = z.object({
  primaryColor: z.string().max(60).optional(),
  primaryHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  secondaryColors: z.array(regionSchema).max(12).optional().default([]),
  trimColors: z.array(regionSchema).max(12).optional().default([]),
  buttonColors: z.array(regionSchema).max(6).optional().default([]),
  printColors: z.array(regionSchema).max(12).optional().default([]),
  fabricAppearance: z.string().max(300).optional(),
  designDifferences: z
    .array(z.string().max(200))
    .max(12)
    .optional()
    .default([]),
  conflicts: z.array(z.string().max(200)).max(12).optional().default([]),
  confidence: z.number().min(0).max(1).optional(),
});

/**
 * 只从当前唯一生效的独立参考图识别颜色。
 * 原款/三姿势底图不得进入颜色分析，避免其旧颜色污染当前新色款。
 */
export async function analyzeColorVariantReferences(
  referenceImages: ColorReferenceImage[],
): Promise<ColorVariantColorProfile> {
  const runtime = await resolveProductAnalysisModel();
  const active =
    referenceImages.find((image) => image.isPrimary) || referenceImages[0];
  if (!active) throw new Error("缺少当前颜色款参考图");
  const referenceBuffer = await localImage(active.path);
  const normalizedReference = await resizeToJpeg(referenceBuffer, 1280, 88);
  const dataUrl = toDataUrl(normalizedReference, "image/jpeg");

  const system =
    "你是电商服装颜色识别助手。只允许分析当前这一张新上传的颜色参考图，识别其真实可见的主色、辅色、包边、条纹、拼接、印花和局部色区。禁止引用历史图片、旧色卡、文件名、标题或原款底图。参考图可能倾斜、悬挂、折叠或局部遮挡；先理解视角，再校正白平衡、曝光、阴影和高光对颜色的影响。只分析服装，忽略背景、皮肤、头发和道具。看不清的局部不得猜测。";
  const prompt =
    `当前只有这一张新独立参考图，它是本次颜色事实的唯一来源。输出 primaryColor 和 primaryHex 时观察服装主体面积最大的真实固有色；不要把背景、高光、阴影、衣架或小面积条纹当成主色。` +
    `【视角归一】图片可能是正面、背面、侧面、细节特写、平铺、上身或倾斜视角：先判断可见范围；主体色按服装主体判断；条纹、包边、拼接、印花只记录真实可见的颜色与对应部位；同色的明暗变化不能拆成多个颜色；不可见区域不得猜测。` +
    `输出：primaryColor、primaryHex、secondaryColors、trimColors、buttonColors、printColors、fabricAppearance、designDifferences、conflicts、confidence。designDifferences 只记录图片中可见的设计观察，不能授权复色改款；conflicts 必须为空数组，因为只有一张生效参考图。只返回 JSON：{"primaryColor":"","primaryHex":"#RRGGBB","secondaryColors":[{"part":"","colorName":"","hex":""}],"trimColors":[],"buttonColors":[],"printColors":[],"fabricAppearance":"","designDifferences":[],"conflicts":[],"confidence":0.9}`;

  const [raw, referenceColors] = await Promise.all([
    requestVisionJson(runtime, dataUrl, system, prompt),
    extractStructuredColors(normalizedReference),
  ]);
  const parsed = profileSchema.parse(raw);
  const profile = reconcileVariantPrimaryColor(
    {
      primaryColor: parsed.primaryColor || undefined,
      primaryHex: parsed.primaryHex?.toUpperCase() || undefined,
      secondaryColors: parsed.secondaryColors.map((s) => ({
        ...s,
        hex: s.hex?.toUpperCase(),
      })),
      trimColors: parsed.trimColors.map((s) => ({
        ...s,
        hex: s.hex?.toUpperCase(),
      })),
      buttonColors: parsed.buttonColors.map((s) => ({
        ...s,
        hex: s.hex?.toUpperCase(),
      })),
      printColors: parsed.printColors.map((s) => ({
        ...s,
        hex: s.hex?.toUpperCase(),
      })),
      fabricAppearance: parsed.fabricAppearance || undefined,
      designDifferences: parsed.designDifferences,
      conflicts: parsed.conflicts,
      confidence: parsed.confidence,
    },
    referenceColors.primaryColor,
  );
  return profile;
}
