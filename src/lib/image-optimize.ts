import sharp from "sharp";

export const FINAL_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const TARGET_FINAL_BYTES = 2.7 * 1024 * 1024;
export const MINIMUM_QUALITY = 82;
export const MINIMUM_WIDTH = 1400;
const QUALITY_STEPS = [95, 92, 90, 88, 85, 82] as const;
const SIZE_STEPS = [
  { width: 1920, height: 2560 },
  { width: 1800, height: 2400 },
  { width: 1600, height: 2133 },
] as const;

export type OptimizeResult = {
  buffer: Buffer;
  mime: "image/jpeg";
  originalSize: number;
  finalSize: number;
  optimized: boolean;
  quality?: number;
  width?: number;
  height?: number;
  warning?: string;
};

/**
 * 把最终交付图片压缩到 ≤3MB，纯本地处理，不调用任何模型。
 * 策略：原图已达标则不压缩；否则分级降 JPEG 质量；仍超才降分辨率（保持 3:4）。
 */
export async function optimizeFinalImage(input: Buffer): Promise<OptimizeResult> {
  const originalSize = input.length;
  const meta = await sharp(input).metadata();
  const originalWidth = meta.width || 0;
  const originalHeight = meta.height || 0;

  if (originalSize <= FINAL_IMAGE_MAX_BYTES && originalWidth >= MINIMUM_WIDTH) {
    return {
      buffer: input,
      mime: "image/jpeg",
      originalSize,
      finalSize: originalSize,
      optimized: false,
      width: originalWidth,
      height: originalHeight,
    };
  }

  // 第一步：分级降低 JPEG 质量
  for (const quality of QUALITY_STEPS) {
    const candidate = await sharp(input)
      .rotate()
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (candidate.length <= FINAL_IMAGE_MAX_BYTES) {
      return {
        buffer: candidate,
        mime: "image/jpeg",
        originalSize,
        finalSize: candidate.length,
        optimized: true,
        quality,
        width: originalWidth,
        height: originalHeight,
      };
    }
  }

  // 第二步：质量已到最低仍超限，逐步降低分辨率（保持 3:4）
  for (const size of SIZE_STEPS) {
    if (originalWidth < size.width) continue;
    const candidate = await sharp(input)
      .rotate()
      .resize({ width: size.width, height: size.height, fit: "fill" })
      .jpeg({ quality: MINIMUM_QUALITY, mozjpeg: true })
      .toBuffer();
    if (candidate.length <= FINAL_IMAGE_MAX_BYTES) {
      return {
        buffer: candidate,
        mime: "image/jpeg",
        originalSize,
        finalSize: candidate.length,
        optimized: true,
        quality: MINIMUM_QUALITY,
        width: size.width,
        height: size.height,
      };
    }
  }

  // 第三步：达到最低质量保护仍无法压缩到 3MB，返回最接近的结果并给出真实警告
  const fallback = await sharp(input)
    .rotate()
    .resize({ width: SIZE_STEPS.at(-1)!.width, height: SIZE_STEPS.at(-1)!.height, fit: "fill" })
    .jpeg({ quality: MINIMUM_QUALITY, mozjpeg: true })
    .toBuffer();
  return {
    buffer: fallback,
    mime: "image/jpeg",
    originalSize,
    finalSize: fallback.length,
    optimized: true,
    quality: MINIMUM_QUALITY,
    width: SIZE_STEPS.at(-1)!.width,
    height: SIZE_STEPS.at(-1)!.height,
    warning: "当前图片无法在最低质量保护范围内压缩至3MB以内",
  };
}

export async function verifyFinalImage(buffer: Buffer): Promise<{
  ok: boolean;
  reason?: string;
  size: number;
  width?: number;
  height?: number;
}> {
  if (buffer.length === 0) return { ok: false, reason: "文件为空（0KB）", size: 0 };
  if (buffer.length > FINAL_IMAGE_MAX_BYTES) return { ok: false, reason: "文件超过3MB", size: buffer.length };
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) return { ok: false, reason: "无法解码或缺少尺寸", size: buffer.length };
    const ratio = meta.width / meta.height;
    if (Math.abs(ratio - 0.75) > 0.02) return { ok: false, reason: `比例 ${ratio.toFixed(2)} 偏离 3:4`, size: buffer.length, width: meta.width, height: meta.height };
    return { ok: true, size: buffer.length, width: meta.width, height: meta.height };
  } catch {
    return { ok: false, reason: "图片损坏或无法解码", size: buffer.length };
  }
}
