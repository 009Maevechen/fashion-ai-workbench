import type { GenerationMode } from "./ai/types";

export type SizeTier = "1K" | "2K" | "4K";

/** 各档位目标长边。4K 受最大边限制收敛到 3840。 */
export const SIZE_TIER_LONG_EDGE: Record<SizeTier, number> = {
  "1K": 1024,
  "2K": 2048,
  "4K": 3840,
};
export const MAX_GENERATION_EDGE = 3840;
export const SIZE_ALIGNMENT = 16;
export const MAX_ASPECT_RATIO = 3;
export const MAX_RATIO_ERROR = 0.01;

export type GenerationSize = { width: number; height: number; tier: SizeTier; ratio: number };

/** 生成模式映射到尺寸档位：快速=1K，标准=2K，精细=4K。 */
export function resolveSizeTier(mode: GenerationMode): SizeTier {
  return mode === "fast" ? "1K" : mode === "standard" ? "2K" : "4K";
}

const align = (value: number) => Math.max(SIZE_ALIGNMENT, Math.round(value / SIZE_ALIGNMENT) * SIZE_ALIGNMENT);

/**
 * 根据基准图宽高比 + 档位计算目标尺寸：
 * 长边取档位目标（≤3840），按比例算另一边，宽高都按 16 像素对齐。
 */
export function computeTargetSize(baseWidth: number, baseHeight: number, tier: SizeTier): GenerationSize {
  if (!baseWidth || !baseHeight) throw new Error("基准图尺寸无效，无法计算目标尺寸");
  const rawRatio = baseWidth / baseHeight;
  const ratio = Math.max(1 / MAX_ASPECT_RATIO, Math.min(MAX_ASPECT_RATIO, rawRatio));
  const longEdge = Math.min(MAX_GENERATION_EDGE, SIZE_TIER_LONG_EDGE[tier]);
  const rawWidth = ratio >= 1 ? longEdge : longEdge * ratio;
  const rawHeight = ratio >= 1 ? longEdge / ratio : longEdge;
  return {
    width: Math.min(MAX_GENERATION_EDGE, align(rawWidth)),
    height: Math.min(MAX_GENERATION_EDGE, align(rawHeight)),
    tier,
    ratio,
  };
}

export type DimensionDecision = "accept" | "normalize" | "fail";

export type DimensionCheck = {
  decision: DimensionDecision;
  actualWidth: number;
  actualHeight: number;
  targetWidth: number;
  targetHeight: number;
  ratioError: number;
  reason?: string;
};

/**
 * 返回图验收：尺寸完全一致→接受；宽高比一致但分辨率不同→等比归一；比例不一致→失败。
 * 绝不裁切、补边、拉伸或用 cover 强行修正比例。
 */
export function checkOutputDimensions(
  actualWidth: number,
  actualHeight: number,
  target: { width: number; height: number },
): DimensionCheck {
  const actualRatio = actualWidth / actualHeight;
  const targetRatio = target.width / target.height;
  const ratioError = Math.abs(actualRatio - targetRatio) / targetRatio;
  if (actualWidth === target.width && actualHeight === target.height)
    return { decision: "accept", actualWidth, actualHeight, targetWidth: target.width, targetHeight: target.height, ratioError };
  if (ratioError <= MAX_RATIO_ERROR)
    return { decision: "normalize", actualWidth, actualHeight, targetWidth: target.width, targetHeight: target.height, ratioError };
  return {
    decision: "fail",
    actualWidth,
    actualHeight,
    targetWidth: target.width,
    targetHeight: target.height,
    ratioError,
    reason: `输出宽高比 ${actualRatio.toFixed(3)} 与基准 ${targetRatio.toFixed(3)} 不一致（偏差 ${(ratioError * 100).toFixed(1)}%），已保留图片但标记未通过`,
  };
}
