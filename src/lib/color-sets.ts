import type { TargetColor } from "./db";
import { colorDistance } from "./color-palette";
import {
  isButtonColorPart,
  isComplexColorPart,
} from "./ai/color-analysis-normalize";

export type AnalyzedGarmentColor = {
  name: string;
  generationName?: string;
  hex: string;
  trimColorName?: string;
  trimHex?: string;
  trimPart?: string;
  confidence?: number;
  designDetails?: string[];
  materialFeatures?: string;
  colorRegions?: TargetColor["colorRegions"];
  isUniformColor?: boolean;
  uniformColorConfidence?: number;
  occlusion?: TargetColor["occlusion"];
  occlusionPolicy?: TargetColor["occlusionPolicy"];
  occlusionReason?: string;
  styleRelation?: TargetColor["styleRelation"];
  structureMode?: TargetColor["structureMode"];
  structureDifferenceConfidence?: number;
  structureDifferences?: string[];
  needsReview?: boolean;
  cropImage?: string;
  cropRegion?: { x: number; y: number; width: number; height: number };
};

const trimEdgeLabel = (trim?: string) => {
  const value = trim?.trim();
  return value?.endsWith("边")
    ? value
    : value?.endsWith("色")
      ? `${value.slice(0, -1)}边`
      : value
        ? `${value}边`
        : "";
};

export function analyzedColorName(
  color: Pick<
    AnalyzedGarmentColor,
    "name" | "trimColorName" | "trimPart" | "generationName"
  >,
) {
  if (
    isButtonColorPart(color.trimPart) ||
    /扣子|纽扣|钮扣/.test(color.generationName || "")
  )
    return color.name.trim();
  if (color.generationName?.trim()) return color.generationName.trim();
  const main = color.name.trim(),
    trimLabel = trimEdgeLabel(color.trimColorName);
  return trimLabel && !main.endsWith(trimLabel) ? `${main}${trimLabel}` : main;
}

/** 将重新识别到的边饰/局部配色写回已有色卡，同时保留已有生成结果。 */
export function mergeAnalyzedColorDetails(
  existing: TargetColor[],
  analyzed: AnalyzedGarmentColor[],
  maximumDistance = 12,
) {
  const claimed = new Set<number>();
  const colors = existing.map((color) => {
    if (!color.hex) return color;
    let match = -1,
      best = Number.POSITIVE_INFINITY;
    analyzed.forEach((candidate, index) => {
      if (claimed.has(index)) return;
      const distance = colorDistance(color.hex!, candidate.hex);
      if (distance < best) {
        best = distance;
        match = index;
      }
    });
    if (match < 0 || best > maximumDistance) return color;
    claimed.add(match);
    const candidate = analyzed[match];
    const preserveManualStructure =
      color.manualReviewConfirmed && Boolean(color.structureMode);
    const buttonOnly = isButtonColorPart(candidate.trimPart);
    return {
      ...color,
      name: analyzedColorName(candidate),
      trimColorName: buttonOnly
        ? undefined
        : candidate.trimColorName || color.trimColorName,
      trimHex: buttonOnly ? undefined : candidate.trimHex || color.trimHex,
      trimPart: buttonOnly ? undefined : candidate.trimPart || color.trimPart,
      designDetails: candidate.designDetails?.length
        ? candidate.designDetails
        : color.designDetails,
      materialFeatures: candidate.materialFeatures || color.materialFeatures,
      colorRegions: candidate.colorRegions?.length
        ? candidate.colorRegions
        : color.colorRegions,
      isUniformColor: candidate.isUniformColor ?? color.isUniformColor,
      uniformColorConfidence:
        candidate.uniformColorConfidence ?? color.uniformColorConfidence,
      occlusion: candidate.occlusion || color.occlusion,
      occlusionPolicy: candidate.occlusionPolicy || color.occlusionPolicy,
      occlusionReason: candidate.occlusionReason || color.occlusionReason,
      styleRelation: preserveManualStructure
        ? color.styleRelation
        : candidate.styleRelation || color.styleRelation,
      structureMode: preserveManualStructure
        ? color.structureMode
        : candidate.structureMode || color.structureMode || "same_style",
      structureDifferenceConfidence: preserveManualStructure
        ? color.structureDifferenceConfidence
        : (candidate.structureDifferenceConfidence ??
          color.structureDifferenceConfidence),
      structureDifferences: preserveManualStructure
        ? color.structureDifferences
        : candidate.structureDifferences?.length
          ? candidate.structureDifferences
          : color.structureDifferences,
      designConfidence: candidate.confidence ?? color.designConfidence,
      designNeedsReview: preserveManualStructure
        ? false
        : Boolean(
            candidate.needsReview ||
            (candidate.confidence ?? 1) < 0.65 ||
            !(color.cropImage || candidate.cropImage),
          ),
      cropImage: color.cropImage || candidate.cropImage,
      cropRegion: color.cropRegion || candidate.cropRegion,
    };
  });
  return {
    colors,
    unmatched: analyzed.filter((_, index) => !claimed.has(index)),
  };
}

export function normalizedColorName(
  color: Pick<TargetColor, "name" | "userConfirmedName">,
) {
  return (color.userConfirmedName?.trim() || color.name?.trim() || "").trim();
}
/**
 * 只有真正经过人工操作/确认的色卡才拥有主体色最高优先级。
 * 兼容旧项目：旧数据没有 userConfirmedHex 时，人工确认过的色卡同样视为已锁定。
 */
export function selectedRecolorMainColor(
  color:
    | Pick<
        TargetColor,
        | "name"
        | "userConfirmedName"
        | "userConfirmedHex"
        | "baseHex"
        | "hex"
        | "colorAdjustment"
        | "manualReviewConfirmed"
      >
    | undefined,
) {
  if (!color) return undefined;
  const manuallySelected = Boolean(
    color.userConfirmedName?.trim() ||
    color.userConfirmedHex?.trim() ||
    color.colorAdjustment ||
    color.manualReviewConfirmed,
  );
  if (!manuallySelected) return undefined;
  return {
    name: normalizedColorName(color),
    hex: (
      color.userConfirmedHex?.trim() ||
      color.hex?.trim() ||
      color.baseHex?.trim() ||
      ""
    ).toUpperCase(),
  };
}
export function isComplexColorway(
  color: Pick<
    TargetColor,
    "trimPart" | "colorRegions" | "structureMode" | "structureDifferences"
  >,
) {
  return (
    color.structureMode === "explicit_variant" ||
    Boolean(color.structureDifferences?.length) ||
    isComplexColorPart(color.trimPart) ||
    Boolean(
      color.colorRegions?.some((region) => isComplexColorPart(region.part)),
    )
  );
}
export function recolorColorName(
  color: Pick<
    TargetColor,
    "name" | "trimColorName" | "trimPart" | "outputName"
  >,
) {
  const manual = color.outputName?.trim();
  if (isButtonColorPart(color.trimPart) || /扣子|纽扣|钮扣/.test(manual || ""))
    return normalizedColorName(color);
  if (manual) return manual;
  const main = normalizedColorName(color),
    trim = color.trimColorName?.trim();
  if (!isComplexColorway(color as TargetColor)) return main;
  const trimLabel = trimEdgeLabel(trim);
  return trimLabel && !main.endsWith(trimLabel) ? `${main}${trimLabel}` : main;
}
const MANUAL_TRIM_SUFFIXES = [
  "冷白",
  "米白",
  "纯白",
  "纯黑",
  "深棕",
  "咖啡",
  "巧克力",
  "黑",
  "白",
  "棕",
  "灰",
  "红",
  "粉",
  "蓝",
  "绿",
  "金",
  "银",
];
const MANUAL_TRIM_HEX: Record<string, string> = {
  黑: "#101010",
  纯黑: "#101010",
  白: "#F4F6F5",
  纯白: "#F4F6F5",
  冷白: "#F4F6F5",
  米白: "#EDE8DC",
};

/** 手动输出名称拥有最高优先级，例如“深卡其色黑边”必须覆盖自动识别残留的白色边饰。 */
export function recolorGenerationTrim(
  color: Pick<
    TargetColor,
    | "outputName"
    | "trimColorName"
    | "trimHex"
    | "trimPart"
    | "colorRegions"
    | "structureMode"
    | "structureDifferences"
  >,
) {
  if (
    isButtonColorPart(color.trimPart) ||
    !isComplexColorway(color as TargetColor)
  )
    return { trimColorName: "", trimHex: "" };
  const manual = color.outputName?.trim() || "";
  const suffix = MANUAL_TRIM_SUFFIXES.find((name) =>
    manual.endsWith(`${name}边`),
  );
  if (!suffix)
    return {
      trimColorName: color.trimColorName?.trim() || "",
      trimHex: color.trimHex?.trim() || "",
    };
  return {
    trimColorName: suffix.endsWith("色") ? suffix : `${suffix}色`,
    trimHex: MANUAL_TRIM_HEX[suffix] || "",
  };
}
export function colorResultCount(color: Pick<TargetColor, "poseResults">) {
  return new Set((color.poseResults || []).filter(Boolean)).size;
}
export function expectedColorResultCount(
  color: Pick<TargetColor, "sourceCount">,
) {
  return color.sourceCount && color.sourceCount >= 2 && color.sourceCount <= 4
    ? color.sourceCount
    : 3;
}
export function isColorSetComplete(color: TargetColor) {
  return Boolean(
    normalizedColorName(color) &&
    color.status === "confirmed" &&
    colorResultCount(color) === expectedColorResultCount(color),
  );
}
export function duplicateColorNames(colors: TargetColor[]) {
  const counts = new Map<string, number>();
  for (const color of colors) {
    const name = recolorColorName(color).toLocaleLowerCase();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return new Set(
    [...counts].filter(([, count]) => count > 1).map(([name]) => name),
  );
}
export function colorSetIssue(
  color: TargetColor,
  duplicates = duplicateColorNames([color]),
) {
  const name = recolorColorName(color);
  if (!name) return "需要命名";
  if (duplicates.has(name.toLocaleLowerCase())) return "名称重复";
  const count = colorResultCount(color);
  if (!color.hex && !color.baseHex && !color.cropImage && count === 0)
    return "需要设置颜色";
  if (!color.cropImage && count === 0) return "需要框选整件色款参考";
  const expected = expectedColorResultCount(color);
  if (count < expected) return `复色结果 ${count}/${expected}`;
  if (color.status !== "confirmed")
    return color.status === "stale" ? "需要重新生成" : "等待确认";
  return "已完成";
}
