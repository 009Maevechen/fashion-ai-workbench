import { assessImageQuality, type ImageQualityAssessment } from "./image-quality-check";

export type CorrectionQualityCheck = {
  passed: boolean;
  baselineWidth: number;
  baselineHeight: number;
  outputWidth: number;
  outputHeight: number;
  baselineSharpness: number;
  outputSharpness: number;
  baselineLuminance?:number;
  outputLuminance?:number;
  baselineContrast?:number;
  outputContrast?:number;
  baselineSaturation?:number;
  outputSaturation?:number;
  issues: string[];
};

export function resolveCorrectionQualityCheck(
  baseline: ImageQualityAssessment,
  output: ImageQualityAssessment,
): CorrectionQualityCheck {
  const issues: string[] = [];
  const widthRatio = baseline.width ? output.width / baseline.width : 1;
  const heightRatio = baseline.height ? output.height / baseline.height : 1;
  if (widthRatio < 1 || heightRatio < 1) {
    issues.push(
      `生成结果分辨率下降：${baseline.width}x${baseline.height} → ${output.width}x${output.height}`,
    );
  }
  const minimumSharpness = Math.max(180, baseline.sharpnessScore * 0.85);
  if (baseline.sharpnessScore >= 180 && output.sharpnessScore < minimumSharpness) {
    issues.push(
      `生成结果清晰度明显下降：锐度 ${Math.round(baseline.sharpnessScore)} → ${Math.round(output.sharpnessScore)}`,
    );
  }
  if (output.blurry) issues.push("生成结果存在明显模糊或涂抹感");
  if (output.lowResolution) issues.push("生成结果分辨率不足");
  const baselineLuminance=baseline.meanLuminance,outputLuminance=output.meanLuminance;
  if(baselineLuminance!==undefined&&outputLuminance!==undefined&&baselineLuminance-outputLuminance>18&&outputLuminance<baselineLuminance*.82)issues.push(`生成结果明显变暗：亮度 ${baselineLuminance.toFixed(1)} → ${outputLuminance.toFixed(1)}`);
  const baselineContrast=baseline.luminanceContrast,outputContrast=output.luminanceContrast;
  if(baselineContrast!==undefined&&outputContrast!==undefined&&baselineContrast-outputContrast>8&&outputContrast<baselineContrast*.72)issues.push(`生成结果层次明显下降、存在发灰发闷风险：对比度 ${baselineContrast.toFixed(1)} → ${outputContrast.toFixed(1)}`);
  const baselineSaturation=baseline.meanSaturation,outputSaturation=output.meanSaturation;
  if(baselineSaturation!==undefined&&outputSaturation!==undefined&&baselineSaturation>20&&baselineSaturation-outputSaturation>8&&outputSaturation<baselineSaturation*.7)issues.push(`生成结果色彩活力明显下降、存在灰色污染风险：色彩度 ${baselineSaturation.toFixed(1)} → ${outputSaturation.toFixed(1)}`);
  return {
    passed: issues.length === 0,
    baselineWidth: baseline.width,
    baselineHeight: baseline.height,
    outputWidth: output.width,
    outputHeight: output.height,
    baselineSharpness: baseline.sharpnessScore,
    outputSharpness: output.sharpnessScore,
    baselineLuminance,
    outputLuminance,
    baselineContrast,
    outputContrast,
    baselineSaturation,
    outputSaturation,
    issues: [...new Set(issues)],
  };
}

export async function checkCorrectionQuality(
  baseline: Buffer,
  output: Buffer,
) {
  const [baselineQuality, outputQuality] = await Promise.all([
    assessImageQuality(baseline),
    assessImageQuality(output),
  ]);
  return resolveCorrectionQualityCheck(baselineQuality, outputQuality);
}
