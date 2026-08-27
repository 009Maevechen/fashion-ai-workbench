import "server-only";
import fs from "node:fs/promises";
import sharp from "sharp";
import { z } from "zod";
import { resolveProductAnalysisModel } from "./provider-settings";
import { toDataUrl } from "./storage";
import { requestVisionJson } from "./vision-chat";

const optionalText = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : String(value).trim()),
  z.string().max(200).optional(),
);

const schema = z.object({
  productType: optionalText,
  productSubtype: optionalText,
  poseType: optionalText,
  shotType: optionalText,
  faceVisible: z.preprocess(
    (value) => {
      if (typeof value === "boolean") return value;
      const text = String(value ?? "").trim().toLowerCase();
      if (["是", "露脸", "yes", "true", "1"].includes(text)) return true;
      if (["否", "不露脸", "no", "false", "0"].includes(text)) return false;
      return undefined;
    },
    z.boolean().optional(),
  ),
  displayFocus: optionalText,
  composition: optionalText,
  styleTags: z.preprocess(
    (value) => (Array.isArray(value) ? value : String(value ?? "").split(/[,，、]/).map((item) => item.trim()).filter(Boolean)),
    z.array(z.string().max(40)).max(20).default([]),
  ),
  suitableProductTypes: z.preprocess(
    (value) => (Array.isArray(value) ? value : String(value ?? "").split(/[,，、]/).map((item) => item.trim()).filter(Boolean)),
    z.array(z.string().max(40)).max(10).default([]),
  ),
  needsReview: z.boolean().default(false),
});

export type VisualReferenceRecognition = z.infer<typeof schema>;

/**
 * 识别单张参考图：服装类型、姿势、景别、露脸、展示重点、构图、风格标签。
 * 低置信度字段返回空并标记 needsReview，不强行判断。
 */
export async function recognizeVisualReferenceImage(
  imagePath: string,
  _modelId?: string,
): Promise<VisualReferenceRecognition> {
  void _modelId;
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(imagePath);
  } catch {
    throw new Error("参考图文件不存在或无法读取");
  }
  let normalized: Buffer;
  try {
    normalized = await sharp(buffer)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new Error("参考图无法解码");
  }
  const runtime = await resolveProductAnalysisModel();
  const parsed = schema.parse(
    await requestVisionJson(
      runtime,
      toDataUrl(normalized, "image/jpeg"),
      "你是电商服装视觉参考图分析助手。只描述图片中明确可见的信息，不确定的内容留空或标记，不要猜测。只返回合法 JSON。",
      `分析这张参考图，输出 JSON 字段：\n- productType：图片中服装的商品类型（上衣/裤装/连衣裙/半身裙/套装，若无服装可留空）\n- productSubtype：商品子类（如阔腿裤、衬衫、A字裙），不确定留空\n- poseType：姿势类型（如自然站立、轻微迈步、侧身、抬手等）\n- shotType：景别（全身/上半身/下半身/半身）\n- faceVisible：是否露脸（true/false，无法判断则省略）\n- displayFocus：这张图最想展示的服装重点（如裤型/腰头/领口/下摆/面料），不确定留空\n- composition：构图方式（如居中、三分、留白比例、机位角度）\n- styleTags：风格标签数组（如简约、高级感、街拍、通勤）\n- suitableProductTypes：适合展示的服装类型数组\n- needsReview：若任一项无法可靠判断则为 true，否则 false\n只返回一个 JSON 对象，不要解释。`,
    ),
  );
  return parsed;
}
