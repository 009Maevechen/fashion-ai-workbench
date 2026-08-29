import sharp from "sharp";

export type ImageQualityAssessment = {
  sharpnessScore: number;
  width: number;
  height: number;
  blurry: boolean;
  lowResolution: boolean;
  issues: string[];
};

/**
 * 用拉普拉斯方差估算图像清晰度。纯本地计算，不调用任何模型。
 * 值越高越清晰；模糊图、涂抹图、失焦图的值会显著偏低。
 */
async function laplacianVariance(buffer: Buffer): Promise<number> {
  const { data, info } = await sharp(buffer)
    .resize(320, 427, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width,
    h = info.height;
  const lap = new Float64Array(w * h);
  let sum = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const value =
        data[idx - w - 1] +
        data[idx - w] +
        data[idx - w + 1] +
        data[idx - 1] -
        8 * data[idx] +
        data[idx + 1] +
        data[idx + w - 1] +
        data[idx + w] +
        data[idx + w + 1];
      lap[idx] = value;
      sum += value;
      count++;
    }
  }
  const mean = sum / count;
  let variance = 0;
  for (let i = 0; i < lap.length; i++) variance += (lap[i] - mean) ** 2;
  return variance / count;
}

const MIN_WIDTH = 1024;
const MIN_HEIGHT = 1365;
// 拉普拉斯方差清晰度阈值：真实电商清晰图通常 >300，明显模糊/涂抹图 <150。
// 取 180 作为分界，拦截明显模糊，避免误伤正常清晰图。
const BLUR_THRESHOLD = 180;

export async function assessImageQuality(
  buffer: Buffer,
): Promise<ImageQualityAssessment> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const issues: string[] = [];

  const lowResolution = width < MIN_WIDTH || height < MIN_HEIGHT;
  if (lowResolution) {
    issues.push(
      `分辨率不足（${width}x${height}，低于 ${MIN_WIDTH}x${MIN_HEIGHT}）`,
    );
  }

  let sharpnessScore = 0;
  let blurry = false;
  try {
    sharpnessScore = await laplacianVariance(buffer);
    blurry = sharpnessScore < BLUR_THRESHOLD;
    if (blurry) {
      issues.push(
        `画面清晰度偏低（锐度 ${Math.round(sharpnessScore)}），存在模糊或细节丢失风险`,
      );
    }
  } catch {
    // 清晰度计算失败时不算质量问题，交由其他检查判断
  }

  return { sharpnessScore, width, height, blurry, lowResolution, issues };
}
