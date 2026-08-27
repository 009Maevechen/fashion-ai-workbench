import "server-only";
import sharp from "sharp";
import crypto from "node:crypto";
import { z } from "zod";
import type {
  NormalizedCropRegion,
  ProductDetailAssetKey,
  ProductDetailRegionType,
  ProductMissingDetail,
  ProductVisualRegion,
} from "@/lib/db";
import { resolveProductAnalysisModel } from "./provider-settings";
import { localImage, saveOutput, toDataUrl } from "./storage";
import { requestVisionJson } from "./vision-chat";
import { safeSegment } from "./validators";

const REGION_ASSET_KEY: Record<ProductDetailRegionType, ProductDetailAssetKey> = {
  frontView: "productFrontImage",
  backView: "productBackImage",
  detail: "productDetailImage",
  print: "printCloseupImage",
  buttons: "buttonCloseupImage",
  fabric: "fabricTextureImage",
  multiColor: "colorReferenceImage",
  modelReference: "modelReferenceImage",
};
const regionTypeSchema = z.enum([
  "frontView",
  "backView",
  "detail",
  "print",
  "buttons",
  "fabric",
  "multiColor",
]);
const boxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1),
  height: z.number().min(0.01).max(1),
});
const detectionSchema = z.object({
  regions: z
    .array(
      z.object({
        type: regionTypeSchema,
        label: z.string().min(1).max(40),
        confidence: z.coerce.number().min(0).max(1),
        boundingBox: boxSchema,
        needsReview: z.boolean().default(false),
        reason: z.string().min(1).max(200),
      }),
    )
    .max(12)
    .default([]),
  missing: z
    .array(
      z.object({
        type: regionTypeSchema,
        label: z.string().min(1).max(40),
        reason: z.string().min(1).max(200),
      }),
    )
    .max(12)
    .default([]),
});

export type ProductVisualDetection = {
  regions: Array<{
    type: ProductDetailRegionType;
    label: string;
    confidence: number;
    boundingBox: NormalizedCropRegion;
    needsReview: boolean;
    reason: string;
  }>;
  missing: ProductMissingDetail[];
};

export async function detectProductVisualRegions(
  imageUrl: string,
): Promise<ProductVisualDetection> {
  const runtime = await resolveProductAnalysisModel();
  const input = await localImage(imageUrl);
  const normalized = await sharp(input)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const parsed = detectionSchema.parse(
    await requestVisionJson(
      runtime,
      toDataUrl(normalized, "image/jpeg"),
      "你是电商服装商品图细节定位助手。只标注图片中明确可见的服装细节区域，看不到的区域一律不要标注，不得猜测。坐标使用归一化比例（0 到 1 的小数），x/y 是区域左上角，width/height 是区域相对整图的宽高比例。",
      `观察这张产品图，找出其中清晰可见、可用于后续生成时保护细节的独立区域，按以下类型输出归一化裁剪框：\n- frontView：完整正面平铺视图\n- backView：完整背面视图\n- detail：领口、袖口、下摆或肩部等结构细节\n- print：印花或图案特写\n- buttons：纽扣或门襟特写\n- fabric：面料纹理特写\n- multiColor：包含多个颜色的参考区域\n\n规则：\n1. 每个区域只标注一种类型，边界要贴合物件本身，不要包含无关背景。\n2. 同一区域不要重复标注。\n3. 若某类细节整张图都看不到，把它放进 missing 数组并说明原因。\n4. confidence 是 0 到 1 的置信度，低于 0.6 时 needsReview 必须为 true。\n5. 只返回一个合法 JSON 对象：{"regions":[{"type","label","confidence","boundingBox":{"x","y","width","height"},"needsReview","reason"}],"missing":[{"type","label","reason"}]}`,
    ),
  );
  return {
    regions: parsed.regions.map((region) => ({
      type: region.type,
      label: region.label,
      confidence: region.confidence,
      boundingBox: region.boundingBox,
      needsReview: region.needsReview,
      reason: region.reason,
    })),
    missing: parsed.missing,
  };
}

function clampBox(
  box: NormalizedCropRegion,
  width: number,
  height: number,
): { left: number; top: number; cropWidth: number; cropHeight: number } {
  const left = Math.max(0, Math.min(width - 1, Math.round(box.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(box.y * height)));
  const cropWidth = Math.min(width - left, Math.max(16, Math.round(box.width * width)));
  const cropHeight = Math.min(height - top, Math.max(16, Math.round(box.height * height)));
  return { left, top, cropWidth, cropHeight };
}

export async function cropAndUpscaleRegion(
  sku: string,
  sourceUrl: string,
  box: NormalizedCropRegion,
): Promise<{ cropPath: string; upscalePath: string; scale: 2 | 4 }> {
  const input = await localImage(sourceUrl);
  const normalized = await sharp(input).rotate().toBuffer();
  const meta = await sharp(normalized).metadata();
  if (!meta.width || !meta.height) throw new Error("产品主图尺寸无效");
  const { left, top, cropWidth, cropHeight } = clampBox(box, meta.width, meta.height);
  const cropped = await sharp(normalized)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  const scale: 2 | 4 = cropWidth < 512 || cropHeight < 512 ? 4 : 2;
  const upscaled = await sharp(cropped)
    .resize({ width: cropWidth * scale, height: cropHeight * scale, kernel: "lanczos3" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  const id = crypto.randomUUID();
  const cropPath = await saveOutput(
    sku,
    "source/visual-details/crop",
    `${safeSegment(String(id))}-crop.jpg`,
    cropped,
  );
  const upscalePath = await saveOutput(
    sku,
    "source/visual-details/upscale",
    `${safeSegment(String(id))}-${scale}x.jpg`,
    upscaled,
  );
  return { cropPath, upscalePath, scale };
}

export async function buildVisualRegion(
  sku: string,
  sourceUrl: string,
  detected: ProductVisualDetection["regions"][number],
): Promise<ProductVisualRegion> {
  const { cropPath, upscalePath, scale } = await cropAndUpscaleRegion(
    sku,
    sourceUrl,
    detected.boundingBox,
  );
  return {
    id: crypto.randomUUID(),
    type: detected.type,
    label: detected.label,
    confidence: detected.confidence,
    boundingBox: detected.boundingBox,
    cropPath,
    upscalePath,
    assetKey: REGION_ASSET_KEY[detected.type],
    needsReview: detected.needsReview,
    reason: detected.reason,
    scale,
  };
}
