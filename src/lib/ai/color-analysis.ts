import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { resolveProductAnalysisModel } from "./provider-settings";
import { localImage, toDataUrl } from "./storage";
import { requestTextJson, requestVisionText } from "./vision-chat";

const schema = z.object({
  colors: z
    .array(
      z.object({
        name: z.string().min(1).max(30),
        hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        trimColorName: z.string().min(1).max(30),
        trimHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      }),
    )
    .min(1)
    .max(5),
});

export async function analyzeGarmentColors(imageUrl: string) {
  const [visionRuntime, textRuntime, input] = await Promise.all([
    resolveProductAnalysisModel(),
    resolveProductAnalysisModel("fallback"),
    localImage(imageUrl),
  ]);
  const image = await sharp(input)
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
  try {
    const observation = await requestVisionText(
        visionRuntime,
        toDataUrl(image, "image/jpeg"),
        "你是电商服装图片颜色识别助手。只分析目标服装，忽略人物、背景、裤子、包、文字和衣架。",
        "观察最多5款服装配色，逐款说明主体色，以及领口、袖口、下摆、包边等局部边饰色，并估算各颜色 HEX。黑边和白边必须明确说明。",
      );
    return schema.parse(
      await requestTextJson(
        textRuntime,
        "你是服装色卡资料整理助手。只能依据图片识别结果整理色卡，必须只返回合法 JSON。",
        `图片识别结果：\n${observation}\n\n返回 {"colors": [...]}，最多5项；每项包含 name（主体色名称）、hex、trimColorName（边饰色名称）、trimHex。所有 HEX 必须为 #RRGGBB。`,
      ),
    ).colors;
  } catch (error) {
    throw new Error(
      `颜色识别失败：${error instanceof Error ? error.message : "未知错误"}`,
    );
  }
}
