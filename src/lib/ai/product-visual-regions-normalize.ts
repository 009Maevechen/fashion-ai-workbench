import { z } from "zod";
import type {
  NormalizedCropRegion,
  ProductAttributes,
  ProductDetailRegionType,
  ProductMissingDetail,
} from "@/lib/db";

const REGION_TYPES = [
  "frontView",
  "backView",
  "detail",
  "print",
  "buttons",
  "pockets",
  "neckline",
  "sleeve",
  "hem",
  "stitching",
  "fabric",
  "multiColor",
] as const;

const regionTypeSchema = z.enum(REGION_TYPES);
const boxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.01).max(1),
  height: z.number().min(0.01).max(1),
});

// 模型偶尔会返回长句；截断可读文字，而不是让整次细节识别失败。
const shortLabel = z.string().trim().min(1).max(400).transform((value) => value.slice(0, 40));
const shortReason = z.string().trim().min(1).max(1000).transform((value) => value.slice(0, 200));

const detectionSchema = z.object({
  // 不在原始模型输出上设置 16 条硬上限。多色拼图很容易被模型重复标注，
  // 解析后再按类型去重，最终自然收敛到工作台可用的 12 类素材。
  regions: z.array(z.object({
    type: regionTypeSchema,
    label: shortLabel,
    confidence: z.coerce.number().min(0).max(1),
    boundingBox: boxSchema,
    needsReview: z.boolean().default(false),
    reason: shortReason,
    usableForGeneration: z.boolean().default(false),
    visibleEvidence: shortReason.default("未说明可见依据"),
    viewDirection: z.enum(["front", "back", "side", "detail", "unknown"]).default("unknown"),
    targetCoverage: z.coerce.number().min(0).max(1).default(0),
  })).default([]),
  missing: z.array(z.object({
    type: regionTypeSchema,
    label: shortLabel,
    reason: shortReason,
  })).default([]),
});

export type NormalizedProductVisualDetection = {
  regions: Array<{
    type: ProductDetailRegionType;
    label: string;
    confidence: number;
    boundingBox: NormalizedCropRegion;
    needsReview: boolean;
    reason: string;
    usableForGeneration: boolean;
    visibleEvidence: string;
    viewDirection: "front" | "back" | "side" | "detail" | "unknown";
    targetCoverage: number;
  }>;
  missing: ProductMissingDetail[];
};

function regionQuality(region: z.infer<typeof detectionSchema>["regions"][number]) {
  const area = region.boundingBox.width * region.boundingBox.height;
  return region.confidence * 100 + (region.needsReview ? 0 : 5) + Math.min(area, 1) * 2;
}

export function parseProductVisualDetection(value: unknown): NormalizedProductVisualDetection {
  const parsed = detectionSchema.parse(value);
  const bestByType = new Map<(typeof REGION_TYPES)[number], (typeof parsed.regions)[number]>();

  for (const region of parsed.regions) {
    const existing = bestByType.get(region.type);
    if (!existing || regionQuality(region) > regionQuality(existing)) {
      bestByType.set(region.type, region);
    }
  }

  const regions = REGION_TYPES.flatMap((type) => {
    const region = bestByType.get(type);
    return region ? [{
      type: region.type,
      label: region.label,
      confidence: region.confidence,
      boundingBox: region.boundingBox,
      needsReview: region.needsReview,
      reason: region.reason,
      usableForGeneration: region.usableForGeneration,
      visibleEvidence: region.visibleEvidence,
      viewDirection: region.viewDirection,
      targetCoverage: region.targetCoverage,
    }] : [];
  });

  const detectedTypes = new Set(regions.map((region) => region.type));
  const missingByType = new Map<(typeof REGION_TYPES)[number], ProductMissingDetail>();
  for (const item of parsed.missing) {
    if (!detectedTypes.has(item.type) && !missingByType.has(item.type)) {
      missingByType.set(item.type, item);
    }
  }

  return {
    regions,
    missing: REGION_TYPES.flatMap((type) => {
      const item = missingByType.get(type);
      return item ? [item] : [];
    }),
  };
}

const DETAIL_TYPES = new Set<ProductDetailRegionType>([
  "detail", "print", "buttons", "pockets", "neckline", "sleeve", "hem", "stitching", "fabric",
]);

function rejectionReason(region: NormalizedProductVisualDetection["regions"][number]) {
  const { width, height } = region.boundingBox;
  const area = width * height;
  if (!region.usableForGeneration) return "该裁图没有通过作图参考价值审核";
  if (region.confidence < 0.82) return `识别置信度仅 ${Math.round(region.confidence * 100)}%`;
  if (region.type === "frontView" && region.viewDirection !== "front") return "没有明确展示服装正面";
  if (region.type === "backView" && region.viewDirection !== "back") return "没有明确展示服装真实背面";
  if ((region.type === "frontView" || region.type === "backView")
    && (region.targetCoverage < 0.65 || width < 0.16 || height < 0.4 || area < 0.08)) {
    return "服装主体展示不完整，无法作为完整视图参考";
  }
  if (region.type === "multiColor" && (region.targetCoverage < 0.6 || width < 0.3 || area < 0.08)) {
    return "没有完整展示足够的配色对照";
  }
  if (DETAIL_TYPES.has(region.type)
    && (region.targetCoverage < 0.55 || width < 0.04 || height < 0.04 || area < 0.004 || area > 0.3)) {
    return "目标细节占比不足、范围过小或混入过多无关画面";
  }
  return "";
}

export function filterValuableProductVisualDetection(
  detection: NormalizedProductVisualDetection,
): NormalizedProductVisualDetection {
  const accepted: NormalizedProductVisualDetection["regions"] = [];
  const rejected: ProductMissingDetail[] = [];
  for (const region of detection.regions) {
    const reason = rejectionReason(region);
    if (!reason) accepted.push(region);
    else rejected.push({
      type: region.type,
      label: region.label,
      reason: `自动质量审核未通过：${reason}。${region.visibleEvidence}`,
    });
  }

  const acceptedTypes = new Set(accepted.map((region) => region.type));
  const missing = new Map<ProductDetailRegionType, ProductMissingDetail>();
  for (const item of [...detection.missing, ...rejected]) {
    if (!acceptedTypes.has(item.type) && !missing.has(item.type)) missing.set(item.type, item);
  }
  return { regions: accepted, missing: [...missing.values()] };
}

const ABSENCE_RULES: Array<{
  type: ProductDetailRegionType;
  label: string;
  attribute: keyof ProductAttributes;
  absent: (value: string) => boolean;
}> = [
  {
    type: "pockets",
    label: "口袋特写",
    attribute: "pocketDetails",
    absent: (value) => /^(无|0)|无口袋/.test(value.trim()),
  },
  {
    type: "buttons",
    label: "纽扣特写",
    attribute: "buttonCount",
    absent: (value) => /^(无|0)(颗|个|枚)?$/.test(value.trim()),
  },
  {
    type: "print",
    label: "印花特写",
    attribute: "printType",
    absent: (value) => /^(无印花|无|纯色)$/.test(value.trim()),
  },
];

/**
 * 商品资料已经明确确认某种结构不存在时，绝不能再用开叉、衣摆或噪点去
 * 填充对应细节卡片。这里只处理明确的“不存在”，不根据空值作推断。
 */
export function applyExplicitAbsenceRules(
  detection: NormalizedProductVisualDetection,
  attributes?: Partial<ProductAttributes>,
): NormalizedProductVisualDetection {
  if (!attributes) return detection;
  const absentTypes = new Map<ProductDetailRegionType, { label: string; reason: string }>();
  for (const rule of ABSENCE_RULES) {
    const value = attributes[rule.attribute];
    if (typeof value === "string" && value.trim() && rule.absent(value)) {
      absentTypes.set(rule.type, {
        label: rule.label,
        reason: `商品资料明确记录“${value.trim()}”，该结构不存在，无需生成或展示对应特写。`,
      });
    }
  }
  if (!absentTypes.size) return detection;

  const regions = detection.regions.filter((region) => !absentTypes.has(region.type));
  const missing = new Map<ProductDetailRegionType, ProductMissingDetail>();
  for (const item of detection.missing) {
    if (!absentTypes.has(item.type) && !missing.has(item.type)) missing.set(item.type, item);
  }
  for (const [type, item] of absentTypes) missing.set(type, { type, ...item });
  return { regions, missing: [...missing.values()] };
}
