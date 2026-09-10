import "server-only";
import { z } from "zod";
import type { ProductAttributes, ProductType } from "@/lib/db";
import { resolveProductAnalysisModel } from "./provider-settings";
import { localImage, toDataUrl } from "./storage";
import { requestTextJson, requestVisionJson, requestVisionText } from "./vision-chat";
import {
  getCachedProductAnalysis,
  hashBuffer,
  putCachedProductAnalysis,
} from "../product-analysis-cache";
import { resizeToJpeg } from "../image-limits";

const productTypes = ["上衣", "裤装", "连衣裙", "半身裙", "套装"] as const;
const attributeKeys = [
  "mainColor", "printType", "neckline", "sleeveType", "garmentLength",
  "fit", "fabric", "fabricTexture", "weaveStructure", "gradientDesign",
  "colorBlockLayout", "specialDesign", "placketType", "buttonCount",
  "pocketDetails", "trimColor", "printPosition", "asymmetry", "belt",
  "drawstring", "pleats", "slit", "transparency", "lining", "elasticity",
] as const satisfies readonly (keyof ProductAttributes)[];

const attributeText = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return undefined;
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  return value;
}, z.string().optional());

const attributesSchema = z.object({
  mainColor: attributeText,
  printType: attributeText,
  neckline: attributeText,
  sleeveType: attributeText,
  garmentLength: attributeText,
  fit: attributeText,
  fabric: attributeText,
  fabricTexture: attributeText,
  weaveStructure: attributeText,
  gradientDesign: attributeText,
  colorBlockLayout: attributeText,
  specialDesign: attributeText,
  placketType: attributeText,
  buttonCount: attributeText,
  pocketDetails: attributeText,
  trimColor: attributeText,
  printPosition: attributeText,
  asymmetry: attributeText,
  belt: attributeText,
  drawstring: attributeText,
  pleats: attributeText,
  slit: attributeText,
  transparency: attributeText,
  lining: attributeText,
  elasticity: attributeText,
});

const analysisSchema = z.object({
  productType: z.enum(productTypes),
  attributes: attributesSchema,
  detailDescription: z.string().min(1).max(4000).transform((value) => value.trim().slice(0, 800)),
  protectionItems: z.array(z.string().min(1)).max(20).default([]),
});

export type ProductImageAnalysis = {
  productType: ProductType;
  attributes: ProductAttributes;
  detailDescription: string;
  protectionItems: string[];
};

type ProductAnalysisRuntime = typeof globalThis & {
  __workbenchProductAnalysisInflight?: Map<string, Promise<ProductImageAnalysis>>;
};
const analysisRuntime = globalThis as ProductAnalysisRuntime;
const inflight = analysisRuntime.__workbenchProductAnalysisInflight || new Map<string, Promise<ProductImageAnalysis>>();
analysisRuntime.__workbenchProductAnalysisInflight = inflight;

function completeAnalysis(parsed: z.infer<typeof analysisSchema>): ProductImageAnalysis {
  const attributes = Object.fromEntries(
    attributeKeys.map((key) => [key, parsed.attributes[key]?.trim() || "无法从图片确认"]),
  ) as ProductAttributes;
  return { ...parsed, attributes };
}

function shouldUseCompatibilityPass(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /JSON|response[_ -]?format|schema|invalid_type|expected|unrecognized|unsupported parameter|unknown parameter/i.test(message);
}

async function runProductAnalysis(input: Buffer, imageHash: string): Promise<ProductImageAnalysis> {
  const [visionRuntime, textRuntime] = await Promise.all([
    resolveProductAnalysisModel(),
    resolveProductAnalysisModel("fallback"),
  ]);
  const normalized = await resizeToJpeg(input, 1024, 82);
  const imageDataUrl = toDataUrl(normalized, "image/jpeg");
  const fields = attributeKeys.join(", ");
  const observationPrompt = "详细观察图片中的核心服装商品，不要把模特的裤子、包、饰品或背景当成目标商品。必须逐项观察并说明：商品类型、主体色、印花类型、领型、袖型、衣长、版型、面料材质、表面纹理、织法或针法结构、纹理方向与密度、渐变颜色与过渡方向、色块和拼接的边界比例、特殊设计、门襟、纽扣数量、口袋数量和位置、包边颜色、印花位置、左右是否不对称、腰带、抽绳、褶皱、开叉、透明度、内衬和弹性。尤其要区分针织、罗纹、提花、网眼、绒感、光泽和垂坠感；明确可见的不存在结构写‘无’；单张图片无法可靠判断的隐藏信息写‘无法从图片确认’，严禁猜测。";
  let parsed: z.infer<typeof analysisSchema>;

  try {
    parsed = analysisSchema.parse(await requestVisionJson(
      visionRuntime,
      imageDataUrl,
      "你是电商服装图片识别助手。只陈述图片中明确可见的信息，不确定的内容不要猜测。只输出合法 JSON。",
      `${observationPrompt}\n直接返回 JSON：productType 只能是上衣/裤装/连衣裙/半身裙/套装；attributes 必须完整包含 ${fields} 共25项且所有值均为字符串；detailDescription 重点概括材质、织法、纹理、渐变、色块和特殊设计布局；protectionItems 只列出图片中明确可见、生成时必须保护的材质与设计细节。不得省略字段，不得添加图片中看不到的信息。`,
    ));
  } catch (directError) {
    // 网络、鉴权、额度或中转站错误直接返回真实原因，禁止再发一轮必然失败
    // 的请求；只有返回格式不兼容时才使用旧模型兼容链路。
    if (!shouldUseCompatibilityPass(directError)) throw directError;
    try {
      const observation = await requestVisionText(
        visionRuntime,
        imageDataUrl,
        "你是电商服装图片识别助手。只陈述图片中明确可见的信息，不确定的内容不要猜测。",
        observationPrompt,
      );
      parsed = analysisSchema.parse(await requestTextJson(
        textRuntime,
        "你是电商服装资料整理助手。根据图片识别模型提供的观察文字整理资料，不得添加观察中没有的信息，必须只返回合法 JSON。attributes 的每一个字段都必须填写；图片无法证明时统一填‘无法从图片确认’，不得省略字段、不得猜测。",
        `图片识别结果：\n${observation}\n\n整理为 JSON：productType 只能是上衣/裤装/连衣裙/半身裙/套装；attributes 必须完整包含 ${fields} 共25项，所有属性值必须是字符串；detailDescription 必须重点概括材质、织法、纹理、渐变、色块和特殊设计布局；protectionItems 只列出图片中明确可见、生成时必须保护的材质与设计细节。`,
      ));
    } catch (fallbackError) {
      throw new Error(`单次结构化识别失败：${directError instanceof Error ? directError.message : "未知错误"}；兼容识别也失败：${fallbackError instanceof Error ? fallbackError.message : "未知错误"}`);
    }
  }

  const result = completeAnalysis(parsed);
  await putCachedProductAnalysis({
    imageHash,
    productType: result.productType,
    attributes: result.attributes as Record<string, string>,
    detailDescription: result.detailDescription,
    protectionItems: result.protectionItems,
    cachedAt: new Date().toISOString(),
  });
  return result;
}

export async function analyzeProductImage(
  imageUrl: string,
  options: { force?: boolean } = {},
): Promise<ProductImageAnalysis> {
  const input = await localImage(imageUrl);
  const imageHash = hashBuffer(input);
  if (!options.force) {
    const cached = await getCachedProductAnalysis(imageHash);
    if (cached) {
      return {
        productType: cached.productType as ProductType,
        attributes: cached.attributes as ProductAttributes,
        detailDescription: cached.detailDescription,
        protectionItems: cached.protectionItems,
      };
    }
  }

  const inflightKey = `${imageHash}:${options.force ? "force" : "normal"}`;
  const existing = inflight.get(inflightKey);
  if (existing) return existing;
  const pending = runProductAnalysis(input, imageHash);
  inflight.set(inflightKey, pending);
  try {
    return await pending;
  } catch (error) {
    throw new Error(`产品图片识别失败：${error instanceof Error ? error.message : "未知错误"}`);
  } finally {
    if (inflight.get(inflightKey) === pending) inflight.delete(inflightKey);
  }
}
