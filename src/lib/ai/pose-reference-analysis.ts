import "server-only";
import { z } from "zod";
import type { PoseReferenceAnalysis } from "@/lib/db";
import { resolveProductAnalysisModel } from "./provider-settings";
import { localImage, toDataUrl } from "./storage";
import { requestVisionJson } from "./vision-chat";
import { resizeToJpeg } from "../image-limits";

const shortText = (maximum: number) =>
  z
    .string()
    .min(1)
    .transform((value) => value.trim().slice(0, maximum));
const schema = z.object({
  shotType: z.enum(["全身", "上半身", "下半身"]),
  poseDescription: shortText(220),
  framingDescription: shortText(140),
  compositionDescription: shortText(140),
});

export async function analyzePoseReferences(
  images: string[],
): Promise<PoseReferenceAnalysis[]> {
  if (images.length !== 3 || images.some((image) => !image))
    throw new Error("请先准备完整的3张姿势参考图");
  const runtime = await resolveProductAnalysisModel();
  try {
    return await Promise.all(
      images.map(async (referenceImage, index) => {
        const input = await localImage(referenceImage),
          normalized = await resizeToJpeg(input, 1024, 82);
        const result = schema.parse(
          await requestVisionJson(
            runtime,
            toDataUrl(normalized, "image/jpeg"),
            "你是专业电商人像姿势与构图分析师。只分析人物姿势、镜头景别和画面构图，不描述或复制参考图中的服装款式、人物身份和文字。必须只返回合法 JSON。",
            `分析第${index + 1}张姿势参考图。精确提取：景别和裁切边界；相机距离、高度、俯仰与左右角度；头部朝向、视线、肩线、躯干、骨盆；左右手臂、手腕、手指、腿、膝、脚的位置和角度；身体重心、转身幅度；人物在画面中的大小、居中位置、四周留白和背景透视。输出 JSON：shotType 只能是“全身/上半身/下半身”；poseDescription 是可直接用于生图的精确中文姿势咒语；framingDescription 是景别、裁切和镜头咒语；compositionDescription 是人物位置、留白和构图咒语。不要提取服装外观。`,
          ),
        );
        return {
          ...result,
          referenceImage,
          instruction: [
            `姿势：${result.poseDescription}`,
            `景别与镜头：${result.framingDescription}`,
            `构图：${result.compositionDescription}`,
          ]
            .join("；")
            .slice(0, 500),
        };
      }),
    );
  } catch (error) {
    throw new Error(
      `姿势参考图识别失败：${error instanceof Error ? error.message : "未知错误"}`,
    );
  }
}
