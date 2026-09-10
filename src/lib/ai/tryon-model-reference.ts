import "server-only";
import { z } from "zod";
import type { ModelReferenceAnalysis } from "../tryon-edit-pipeline";
import { resolveProductAnalysisModel } from "./provider-settings";
import { requestVisionJson } from "./vision-chat";
import { localImage, toDataUrl } from "./storage";
import { resizeToJpeg } from "../image-limits";
import { runTryOnVisionAnalysis } from "./tryon-vision-retry";

const responseSchema = z.object({
  personIdentity: z.string().min(1).max(400),
  pose: z.string().min(1).max(500),
  bodyProportions: z.string().min(1).max(400),
  shotType: z.string().min(1).max(120),
  composition: z.string().min(1).max(400),
  cameraAngle: z.string().min(1).max(300),
  background: z.string().min(1).max(400),
  lighting: z.string().min(1).max(400),
  skinTone: z.string().min(1).max(300),
  hairstyle: z.string().min(1).max(300),
  faceVisibility: z.enum(["visible", "hidden", "partial"]),
  protectedSceneDetails: z
    .array(z.string().min(1).max(300))
    .max(20)
    .default([]),
  needsReview: z.array(z.string().min(1).max(300)).max(12).default([]),
});

export async function analyzeModelReference(
  modelImage: string,
): Promise<ModelReferenceAnalysis> {
  const runtime = await resolveProductAnalysisModel();
  const dataUrl = toDataUrl(
    await resizeToJpeg(await localImage(modelImage), 1400, 88),
    "image/jpeg",
  );
  const parsed = responseSchema.parse(
    await runTryOnVisionAnalysis(() =>
      requestVisionJson(
        runtime,
        dataUrl,
        "你是服装换装中的参考模特图分析器。只分析人物与画面，不提取、描述或借用模特原服装设计。看不清的内容必须放进 needsReview，禁止猜测。",
        `分析这张参考模特图，并锁定后续换装必须保持的视觉事实：人物可见身份特征（不要识别姓名）、姿势与动作、身体比例、景别与裁切边界、构图与人物位置、相机角度、背景、光线与阴影、肤色和皮肤质感、发型、露脸状态、配饰与道具。模特原服装是待删除区域，不得写入任何保护项。只返回 JSON：{"personIdentity":"可见人物特征与身份连续性说明","pose":"精确姿势动作","bodyProportions":"身体比例","shotType":"景别与裁切","composition":"构图位置与留白","cameraAngle":"拍摄角度","background":"背景","lighting":"光线与阴影","skinTone":"肤色与皮肤质感","hairstyle":"发型","faceVisibility":"visible|hidden|partial","protectedSceneDetails":["配饰、道具等非服装事实"],"needsReview":["无法可靠确认项"]}`,
      ),
    ),
  );
  return {
    version: "tryon-model-analysis-v1",
    sourceImage: modelImage,
    ...parsed,
    analyzedAt: new Date().toISOString(),
    model: runtime.model,
  };
}
