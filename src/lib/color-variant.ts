import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { validateUpload, sha, safeSegment } from "./ai/validators";
import { localImage, saveOutput, toDataUrl } from "./ai/storage";
import { resizeToJpeg } from "./image-limits";
import { resolveProductAnalysisModel } from "./ai/provider-settings";
import { requestMultiVisionJson, requestVisionJson } from "./ai/vision-chat";
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
 * 综合某个颜色款的全部参考图识别颜色：主参考图负责整体颜色，补充图负责包边、扣子、
 * 条纹、拼接、印花等局部颜色。多图之间冲突时返回 conflicts，需要人工确认。
 */
export async function analyzeColorVariantReferences(
  referenceImages: ColorReferenceImage[],
  baseStyleUrl?: string,
): Promise<ColorVariantColorProfile> {
  const runtime = await resolveProductAnalysisModel();
  const ordered = [
    ...referenceImages.filter((img) => img.isPrimary),
    ...referenceImages.filter((img) => !img.isPrimary),
  ];
  const masters = ordered.length ? ordered : referenceImages;
  const refBuffers = await Promise.all(
    masters.map((img) => localImage(img.path)),
  );
  const baseBuffer =
    baseStyleUrl && baseStyleUrl !== masters[0]?.path
      ? await localImage(baseStyleUrl)
      : undefined;
  const normalizedBaseBuffer = baseBuffer
    ? await resizeToJpeg(baseBuffer, 1280, 88)
    : undefined;
  const normalizedRefs = await Promise.all(
    refBuffers.map((b) => resizeToJpeg(b, 1280, 88)),
  );
  const dataUrls = [
    ...normalizedRefs.map((b) => toDataUrl(b, "image/jpeg")),
    ...(normalizedBaseBuffer
      ? [toDataUrl(normalizedBaseBuffer, "image/jpeg")]
      : []),
  ];

  const system =
    "你是电商服装单色款颜色识别助手。根据同一颜色款的多张参考图，综合识别该颜色款的完整配色与设计布局：主色、辅色、包边/边饰、扣子五金、条纹、拼接、印花、局部色区，以及面料质感。参考图可能是任意视角（正面平铺、背面、侧面、细节特写、模特上身、俯视/仰视/倾斜），你必须先判断每张图的视角，再只依据该视角真实可见的内容识别，不因角度、褶皱、透视或光影而误判颜色。只分析这一款颜色，忽略背景、皮肤、头发、道具、阴影和高光。多张图信息冲突时如实记录冲突，不得自行取舍。";
  const referenceRange =
    masters.length === 1 ? "第1张" : `第1至第${masters.length}张`;
  const baseImageRule = normalizedBaseBuffer
    ? `最后第${masters.length + 1}张是原款结构基准图，只能用于比较版型和布局；其服装颜色完全无关，禁止把它的主色、辅色或局部色写入本颜色款结果。`
    : "本次没有额外的原款结构基准图。";
  const prompt =
    `这是同一个颜色款的 ${masters.length} 张独立参考图。${referenceRange}全部属于当前颜色款；第1张是主参考图，是整体主色的最高优先级依据，后续图只补充包边、条纹、拼接、印花、面料和局部颜色。${baseImageRule}` +
    `输出 primaryColor 和 primaryHex 时必须只观察第1张主参考图中的服装主体，绝对不得使用最后的原款结构基准图颜色。原款与本款颜色不同是正常现象，不得记为 conflicts或 designDifferences。designDifferences 只能记录结构差异，不得把颜色不同写成设计差异。` +
    `【多视角识别规则】每张参考图可能是正面/背面/侧面/细节特写/平铺/上身/倾斜等任意视角：①先判断每张图的视角与可见范围；②主体色按主参考图的服装主体面积判断，不受单一视角遮挡或透视影响；③细节特写只覆盖局部，其颜色只用于对应局部（如扣子、包边），绝不能把局部色当成整件主体色；④同一颜色因角度、褶皱或光影产生的明暗变化属于正常现象，要还原其真实固有色，不要把一个颜色误判成深浅两个颜色；⑤设计布局（口袋、扣子、条纹、拼接、包边、印花、车线等）要综合多视角交叉还原，正面看不到的看背面或细节图，禁止仅凭单视角臆断。` +
    `综合所有参考图，输出该颜色款的：primaryColor（主色名称）、primaryHex（主色HEX）、secondaryColors（辅色，如拼接色/条纹色）、trimColors（包边/边饰等部位颜色）、buttonColors（扣子/五金颜色）、printColors（印花/图案局部颜色）、fabricAppearance（面料质感描述）、designDifferences（该颜色款与原款真实可见的设计差异）、conflicts（本颜色款自己的多张参考图之间互相矛盾的信息，没有则为空数组；原款颜色与本款颜色不同不算冲突）、confidence（0到1综合置信度）。` +
    `只有当本颜色款自己的多张参考图给出的颜色信息互相矛盾（例如主色一张偏绿一张偏蓝、包边一张有另一张无）时，才把矛盾写进 conflicts 并降低 confidence；只有一张参考图时 conflicts 必须为空数组。只返回 JSON：{"primaryColor":"","primaryHex":"#RRGGBB","secondaryColors":[{"part":"","colorName":"","hex":""}],"trimColors":[],"buttonColors":[],"printColors":[],"fabricAppearance":"","designDifferences":[],"conflicts":[],"confidence":0.9}`;

  const remoteRequest =
    dataUrls.length >= 2
      ? requestMultiVisionJson(runtime, dataUrls, system, prompt)
      : requestVisionJson(runtime, dataUrls[0], system, prompt);
  const [raw, referenceColors, baseColors] = await Promise.all([
    remoteRequest,
    extractStructuredColors(normalizedRefs[0]),
    normalizedBaseBuffer
      ? extractStructuredColors(normalizedBaseBuffer)
      : Promise.resolve(undefined),
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
    baseColors?.primaryColor,
  );
  return profile;
}
