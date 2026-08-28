import sharp from "sharp";

export type StructuredColor = {
  name: string;
  hex: string;
  pixelRatio: number;
  confidence: number;
};

export type ColorVariant = {
  name: string;
  hex: string;
  order: number;
  pixelRatio: number;
  confidence: number;
};

export type StructuredColorResult = {
  primaryColor: StructuredColor | null;
  secondaryColors: StructuredColor[];
  accentColors: StructuredColor[];
  colorVariants: ColorVariant[];
  confidence: number;
  needsReview: boolean;
  reviewReason?: string;
};

type Lab = [number, number, number];
const clamp = (value: number) => Math.max(0, Math.min(255, value));
const linear = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};
const rgbToLab = (rgb: number[]): Lab => {
  const [r, g, b] = rgb.map(linear);
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const transform = (value: number) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  const fx = transform(x);
  const fy = transform(y);
  const fz = transform(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
export const labDistance = (left: Lab, right: Lab) => Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0));

/**
 * 灰度世界白平衡：把整图 RGB 均值归一化到中性灰，减少暖光偏黄 / 冷光偏蓝。
 * 使用 raw 像素统计，只对图像做整体偏色校正，不改变服装真实色相。
 */
export function grayWorldWhiteBalance(data: Uint8Array, channels: number): Uint8Array {
  if (channels < 3) return data;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  for (let offset = 0; offset + 2 < data.length; offset += channels) {
    if (channels === 4 && data[offset + 3] < 128) continue;
    rSum += data[offset];
    gSum += data[offset + 1];
    bSum += data[offset + 2];
    count += 1;
  }
  if (count === 0) return data;
  const rAvg = rSum / count;
  const gAvg = gSum / count;
  const bAvg = bSum / count;
  const gray = (rAvg + gAvg + bAvg) / 3;
  if (gray <= 0) return data;
  // 限制增益幅度，避免过度校正破坏真实色彩
  const rGain = Math.min(1.35, Math.max(0.75, gray / rAvg));
  const gGain = Math.min(1.35, Math.max(0.75, gray / gAvg));
  const bGain = Math.min(1.35, Math.max(0.75, gray / bAvg));
  const out = new Uint8Array(data.length);
  for (let offset = 0; offset + 2 < data.length; offset += channels) {
    out[offset] = clamp(data[offset] * rGain);
    out[offset + 1] = clamp(data[offset + 1] * gGain);
    out[offset + 2] = clamp(data[offset + 2] * bGain);
    if (channels === 4) out[offset + 3] = data[offset + 3];
  }
  return out;
}

type Bucket = { r: number; g: number; b: number; count: number };

/** 聚类像素为色桶，排除肤色、背景边缘、阴影和高光像素。 */
function clusterPixels(data: Uint8Array, channels: number): Bucket[] {
  const buckets = new Map<string, Bucket>();
  let total = 0;
  const skinCount = new Map<string, number>();
  for (let offset = 0; offset + 2 < data.length; offset += channels) {
    if (channels === 4 && data[offset + 3] < 96) continue;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const lab = rgbToLab([r, g, b]);
    const lightness = lab[0];
    const a = lab[1];
    const bCh = lab[2];
    // 排除明显肤色（暖粉橙区间）
    const isSkin = lightness > 55 && lightness < 90 && a > 12 && a < 30 && bCh > 7 && bCh < 32;
    if (isSkin) {
      const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
      skinCount.set(key, (skinCount.get(key) || 0) + 1);
      continue;
    }
    // 排除近黑色（阴影/深背景）和近白色（高光/过曝）边缘像素
    if (lightness < 6 || lightness > 98) continue;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    buckets.set(key, bucket);
    total += 1;
  }
  return [...buckets.values()]
    .filter((bucket) => bucket.count / Math.max(1, total) > 0.004)
    .sort((left, right) => right.count - left.count)
    .map((bucket) => ({
      r: bucket.r / bucket.count,
      g: bucket.g / bucket.count,
      b: bucket.b / bucket.count,
      count: bucket.count,
    }));
}

function rgbToHex(rgb: number[]): string {
  return `#${rgb.map((value) => clamp(Math.round(value)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * 合并 Lab 距离过近的色桶，得到去重后的候选色。
 */
function mergeBuckets(buckets: Bucket[]): Array<{ rgb: number[]; count: number }> {
  const merged: Array<{ rgb: number[]; count: number }> = [];
  for (const bucket of buckets) {
    const lab = rgbToLab([bucket.r, bucket.g, bucket.b]);
    const match = merged.find((item) => labDistance(rgbToLab(item.rgb), lab) < 8);
    if (match) {
      const total = match.count + bucket.count;
      match.rgb = match.rgb.map((value, index) => (value * match.count + [bucket.r, bucket.g, bucket.b][index] * bucket.count) / total);
      match.count = total;
    } else {
      merged.push({ rgb: [bucket.r, bucket.g, bucket.b], count: bucket.count });
    }
  }
  return merged.sort((a, b) => b.count - a.count);
}

/**
 * 从服装图片缓冲区提取结构化颜色：
 * 白平衡 → 排除肤色/阴影/高光 → 聚类 → 划分主色/辅色/点缀色 → 相近色检测。
 * 纯本地处理，不调用任何模型。
 */
export async function extractStructuredColors(buffer: Buffer): Promise<StructuredColorResult> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels || 3;
  const balanced = grayWorldWhiteBalance(data, channels);
  const buckets = clusterPixels(balanced, channels);
  const merged = mergeBuckets(buckets);
  const total = merged.reduce((sum, item) => sum + item.count, 0) || 1;

  // 主色 = 占比最大的色；辅色 = 占比 8%~30%；点缀色 = 占比 < 8%
  const variants: ColorVariant[] = merged.map((item, index) => {
    const ratio = item.count / total;
    return {
      name: "",
      hex: rgbToHex(item.rgb),
      order: index + 1,
      pixelRatio: Number(ratio.toFixed(4)),
      confidence: Math.min(1, ratio * 3),
    };
  });

  const primary = variants[0] || null;
  // 主色之后：占比 ≥ 8% 归为辅色，< 8% 归为点缀色
  const secondaryColors: StructuredColor[] = variants
    .slice(1)
    .filter((item) => item.pixelRatio >= 0.08)
    .map((item) => ({ name: "", hex: item.hex, pixelRatio: item.pixelRatio, confidence: item.confidence }));
  const accentColors: StructuredColor[] = variants
    .filter((item) => item.pixelRatio < 0.08)
    .map((item) => ({ name: "", hex: item.hex, pixelRatio: item.pixelRatio, confidence: item.confidence }));

  // 置信度与 needsReview 判定
  let needsReview = false;
  let reviewReason: string | undefined;
  const primaryConfidence = primary ? primary.confidence : 0;
  if (!primary) {
    needsReview = true;
    reviewReason = "未能在图片中定位到有效服装主色";
  } else if (primary.pixelRatio < 0.15) {
    needsReview = true;
    reviewReason = "主色像素占比过低，可能受背景干扰，需要人工确认";
  } else if (primaryConfidence < 0.5) {
    needsReview = true;
    reviewReason = "主色与背景区分度不足，需要人工确认";
  }

  const confidence = primary ? Math.round(Math.min(1, primaryConfidence) * 100) : 0;
  return {
    primaryColor: primary ? { name: "", hex: primary.hex, pixelRatio: primary.pixelRatio, confidence: primaryConfidence } : null,
    secondaryColors,
    accentColors,
    colorVariants: variants,
    confidence,
    needsReview,
    reviewReason,
  };
}
