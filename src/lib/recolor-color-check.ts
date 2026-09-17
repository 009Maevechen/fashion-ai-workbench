import { extractStructuredColors } from "./structured-color";
import { colorDistance } from "./color-palette";

export type RecolorColorCheck = {
  passed: boolean;
  referenceHex?: string;
  outputHex?: string;
  distance: number;
  issues: string[];
};

export type RecolorGroupColorCheck = {
  passed: boolean;
  anchorHex?: string;
  maxDistance: number;
  outlierSlots: number[];
  issues: string[];
};

// Lab 色差阈值：复色结果主色与参考图主色的可接受上限。
// 留出白平衡聚类与光照渲染的少量容差，但能拦截明显偏色（换色相、明暗大偏差）。
export const RECOLOR_COLOR_DISTANCE_THRESHOLD = 16;

// 不同姿势的光线和服装明暗会有自然变化，因此跨姿势阈值比“完全相同像素”更稳健；
// 但仍明显严于单张结果与参考图的容差，用来拦截同一色款在各姿势间漂色。
export const RECOLOR_CROSS_POSE_DISTANCE_THRESHOLD = 10;
export const RECOLOR_AUTO_COLOR_RETRY_LIMIT = 1;

/** 只有已经得到明确目标色、且本地 Lab 校验确认偏色时才自动重做。 */
export function shouldAutoRetryRecolorColor(
  check: RecolorColorCheck | undefined,
  attempt: number,
) {
  return Boolean(
    check &&
      !check.passed &&
      check.referenceHex &&
      attempt < RECOLOR_AUTO_COLOR_RETRY_LIMIT,
  );
}

/**
 * 把本地色差测量值写成一条可执行的单图重试约束。
 * 重试仍以原始底图为起点，不把已偏色候选继续编辑，避免画质与人物累计退化。
 */
export function buildRecolorColorRetryInstruction(
  check: RecolorColorCheck,
) {
  return `【本地色差校验未通过 · 单图强制重做】上一候选的服装主体色测得为 ${check.outputHex || "未找到有效主色"}，当前唯一目标是 ${check.referenceHex || "当前参考图主体色"}，Lab 色差 ${Math.round(check.distance)}。必须从第1张原始底图重新执行，仅校正目标服装主体色的固有色；保留原图光影和纹理，不改条纹、包边、面料、人物、背景或构图，不得以上一候选为底图继续累积编辑。`;
}

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
 * 同一颜色款跨姿势的一致性检查。
 *
 * 以所有结果中 Lab 距离总和最小的颜色作为 medoid（真实结果之一，不凭空平均），
 * 只标记偏离该中心色的姿势，避免一张失败导致整组图片重做。
 */
export function resolveRecolorGroupColorConsistency(
  items: Array<{ slot: number; outputHex?: string }>,
): RecolorGroupColorCheck {
  const comparable = items.filter(
    (item): item is { slot: number; outputHex: string } =>
      Boolean(item.outputHex),
  );
  if (comparable.length < 2)
    return {
      passed: true,
      anchorHex: comparable[0]?.outputHex,
      maxDistance: 0,
      outlierSlots: [],
      issues: [],
    };

  const anchor = comparable.reduce((best, candidate) => {
    const total = comparable.reduce(
      (sum, other) => sum + colorDistance(candidate.outputHex, other.outputHex),
      0,
    );
    return !best || total < best.total ? { ...candidate, total } : best;
  }, undefined as ({ slot: number; outputHex: string; total: number } | undefined));
  const distances = comparable.map((item) => ({
    slot: item.slot,
    distance: colorDistance(anchor!.outputHex, item.outputHex),
  }));
  const outlierSlots = distances
    .filter((item) => item.distance > RECOLOR_CROSS_POSE_DISTANCE_THRESHOLD)
    .map((item) => item.slot);
  const maxDistance = Math.max(...distances.map((item) => item.distance));
  return {
    passed: outlierSlots.length === 0,
    anchorHex: anchor!.outputHex,
    maxDistance: Math.round(maxDistance),
    outlierSlots,
    issues: outlierSlots.length
      ? [
          `同一颜色款在姿势 ${outlierSlots.join("、")} 出现明显漂色（基准 ${anchor!.outputHex}，最大色差 ${Math.round(maxDistance)}）`,
        ]
      : [],
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
          `复色结果主色与当前唯一目标色偏差过大（目标 ${referenceHex}，结果 ${match.outputHex || "未找到"}，色差 ${Math.round(match.distance)}）`,
        ],
  };
}
