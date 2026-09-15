import { extractStructuredColors } from "./structured-color";
import { colorDistance } from "./color-palette";

export type RecolorColorCheck = {
  passed: boolean;
  referenceHex?: string;
  outputHex?: string;
  distance: number;
  issues: string[];
};

// Lab 色差阈值：复色结果主色与参考图主色的可接受上限。
// 留出白平衡聚类与光照渲染的少量容差，但能拦截明显偏色（换色相、明暗大偏差）。
export const RECOLOR_COLOR_DISTANCE_THRESHOLD = 16;

/** 纯函数：判断参考主色是否在输出候选色里找到足够接近的颜色。 */
export function resolveRecolorColorMatch(
  referenceHex: string | undefined,
  outputHexes: Array<string | undefined>,
): { passed: boolean; distance: number; outputHex?: string } {
  if (!referenceHex) return { passed: false, distance: 0 };
  const candidates = outputHexes.filter((hex): hex is string => Boolean(hex));
  if (!candidates.length) return { passed: false, distance: 0 };
  let best = Infinity;
  let bestHex: string | undefined;
  for (const hex of candidates) {
    const distance = colorDistance(referenceHex, hex);
    if (distance < best) {
      best = distance;
      bestHex = hex;
    }
  }
  return {
    passed: best <= RECOLOR_COLOR_DISTANCE_THRESHOLD,
    distance: best,
    outputHex: bestHex,
  };
}

/**
 * 复色颜色精确校验：提取参考图主色与结果图主色，做本地 Lab 色差比对。
 * 不依赖视觉模型，能拦截明显偏色（换色相、明暗大偏差）。
 */
export async function checkRecolorColorMatch(
  reference: Buffer,
  output: Buffer,
  expectedMainHex?: string,
): Promise<RecolorColorCheck> {
  const [referenceColors, outputColors] = await Promise.all([
    expectedMainHex ? Promise.resolve(undefined) : extractStructuredColors(reference),
    extractStructuredColors(output),
  ]);
  // 人工基本色一旦锁定，就以该色检查主体；只有未锁定时才回退到照片取色。
  const referenceHex =
    expectedMainHex?.trim().toUpperCase() ||
    referenceColors?.primaryColor?.hex;
  const outputHexes = outputColors.colorVariants
    .slice(0, 8)
    .map((variant) => variant.hex);
  const match = resolveRecolorColorMatch(referenceHex, outputHexes);
  return {
    passed: match.passed,
    referenceHex,
    outputHex: match.outputHex,
    distance: Math.round(match.distance),
    issues: match.passed
      ? []
      : [
          `复色结果主色与${expectedMainHex ? "用户基本色" : "参考图主色"}偏差过大（目标 ${referenceHex}，结果 ${match.outputHex || "未找到"}，色差 ${Math.round(match.distance)}）`,
        ],
  };
}
