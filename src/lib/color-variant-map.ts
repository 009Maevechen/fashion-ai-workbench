import type { ColorVariantColorProfile } from "./db";
import { colorDistance, readableColorName } from "./color-palette";

export const COLOR_VARIANT_ANALYSIS_VERSION =
  "color-variant-v2-reference-first";

export function colorVariantAnalysisSignature(
  images: Array<{ id: string; hash: string }>,
  selectedMainColor?: { name?: string; hex?: string },
) {
  const selected = [
    selectedMainColor?.name?.trim(),
    selectedMainColor?.hex?.trim().toUpperCase(),
  ]
    .filter(Boolean)
    .join(":");
  return `${COLOR_VARIANT_ANALYSIS_VERSION}:${images
    .map((image) => `${image.id}:${image.hash}`)
    .join("|")}${selected ? `|selected-main:${selected}` : ""}`;
}

export function isCurrentColorVariantAnalysis(signature?: string) {
  return Boolean(signature?.startsWith(`${COLOR_VARIANT_ANALYSIS_VERSION}:`));
}

type LocalPrimaryColor = {
  hex: string;
  pixelRatio: number;
  confidence: number;
};

/**
 * 拦截视觉模型把“原款结构底图”的颜色错当成当前色款。
 * 只有当本地参考图主色证据足够强，且远程结果明显更接近底图时才纠正，
 * 避免在服装占比过小时把背景色误当主色。
 */
export function reconcileVariantPrimaryColor(
  profile: ColorVariantColorProfile,
  referencePrimary: LocalPrimaryColor | null | undefined,
  basePrimary?: LocalPrimaryColor | null,
): ColorVariantColorProfile {
  if (!profile.primaryHex || !referencePrimary) return profile;
  if (referencePrimary.pixelRatio < 0.35 || referencePrimary.confidence < 0.75)
    return profile;
  const remoteToReference = colorDistance(
    profile.primaryHex,
    referencePrimary.hex,
  );
  const remoteToBase = basePrimary
    ? colorDistance(profile.primaryHex, basePrimary.hex)
    : Infinity;
  if (remoteToReference < 24 || remoteToBase + 8 >= remoteToReference)
    return profile;
  const correctedHex = referencePrimary.hex.toUpperCase();
  return {
    ...profile,
    primaryColor: readableColorName(correctedHex),
    primaryHex: correctedHex,
    confidence: Math.max(0.75, Math.min(profile.confidence ?? 1, 0.9)),
  };
}

/**
 * 从识别结果生成部位颜色映射（供复色提示词与一致性检查使用）。
 * 同一部位出现多道颜色时（例如下摆条纹第1道/第2道），按顺序编号保留，
 * 绝不把多道不同颜色合并成一道。
 */
export function buildColorMap(
  profile: ColorVariantColorProfile | undefined,
  selectedMainColor?: { name?: string; hex?: string },
): Record<string, string> {
  const map: Record<string, string> = {};
  if (!profile) return map;
  const selectedMain =
    selectedMainColor?.hex?.trim().toUpperCase() ||
    selectedMainColor?.name?.trim();
  if (selectedMain) map.mainBody = selectedMain;
  else if (profile.primaryHex) map.mainBody = profile.primaryHex;
  else if (profile.primaryColor) map.mainBody = profile.primaryColor;
  const selectedHex = selectedMainColor?.hex?.trim().toUpperCase();
  const observedPrimaryHex = profile.primaryHex?.trim().toUpperCase();
  const seen = new Map<string, number>();
  const put = (part: string | undefined, value: string | undefined) => {
    const key = part?.trim();
    if (!key || !value) return;
    // 参考照片里与主体实际同色的领口/袖口/罗纹，会因阴影被识别成更深或更浅；
    // 用户锁定基本色后，这些同色区域必须一起跟随主体，而不是保留照片色差。
    const normalizedValue = value.trim().toUpperCase();
    const resolvedValue =
      selectedHex &&
      observedPrimaryHex &&
      /^#[0-9A-F]{6}$/.test(normalizedValue) &&
      colorDistance(normalizedValue, observedPrimaryHex) < 12
        ? selectedHex
        : value;
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    map[count === 0 ? key : `${key}${count + 1}`] = resolvedValue;
  };
  for (const item of profile.trimColors || [])
    put(item.part, item.hex || item.colorName);
  for (const item of profile.secondaryColors || [])
    put(item.part, item.hex || item.colorName);
  if (profile.buttonColors?.length)
    map.buttons = profile.buttonColors
      .map((b) => b.hex || b.colorName)
      .join("/");
  return map;
}

/** 判断该颜色款是否需要人工确认：多图冲突或置信度过低。 */
export function referenceNeedsReview(
  profile: ColorVariantColorProfile | undefined,
): boolean {
  if (!profile) return false;
  if (profile.conflicts && profile.conflicts.length > 0) return true;
  if (profile.confidence !== undefined && profile.confidence < 0.65)
    return true;
  return false;
}
