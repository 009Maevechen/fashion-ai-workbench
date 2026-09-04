import "server-only";
import { z } from "zod";
import { resolveProductAnalysisModel } from "./provider-settings";
import { localImage, toDataUrl } from "./storage";
import { requestTextJson, requestVisionText } from "./vision-chat";
import { readableColorName } from "../color-palette";
import { extractStructuredColors } from "../structured-color";
import { resizeToJpeg } from "../image-limits";
import { chooseSpecificColorName, generationColorName, normalizeMaterialFeatures, normalizeTrimPart } from "./color-analysis-normalize";

const normalizedBox = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
}).refine((box) => box.x + box.width <= 1.01 && box.y + box.height <= 1.01, "颜色款区域越界");

const shortName = z.string().min(1).max(200).transform((value) => value.trim().slice(0, 30));
const optionalShortName = z.preprocess((value) => value == null ? "" : value, z.string().max(200).transform((value) => value.trim().slice(0, 30)));
const shortDesignDetail = z.string().min(1).max(400).transform((value) => value.trim().slice(0, 80));
const shortMaterial = z.string().max(1200).transform((value) => value.trim().slice(0, 300));
const colorRegion = z.object({
  part: z.string().min(1).max(120).transform((value) => value.trim().slice(0, 40)),
  colorName: shortName,
  hex: z.preprocess((value) => value == null ? "" : value, z.union([z.literal(""),z.string().regex(/^#[0-9A-Fa-f]{6}$/)])),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});
const colorItem = z.object({
  name: shortName,
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  trimColorName: optionalShortName,
  trimHex: z.preprocess((value) => value == null ? "" : value, z.union([z.literal(""),z.string().regex(/^#[0-9A-Fa-f]{6}$/)])),
  trimPart: optionalShortName,
  confidence: z.number().min(0).max(1).optional().default(0.5),
  boundingBox: normalizedBox.optional(),
  designDetails: z.array(shortDesignDetail).max(16).optional().default([]),
  materialFeatures: z.preprocess(normalizeMaterialFeatures, shortMaterial),
  colorRegions: z.array(colorRegion).max(20).optional().default([]),
  isUniformColor: z.boolean().optional().default(false),
  uniformColorConfidence: z.number().min(0).max(1).optional().default(0.5),
  occlusion: z.enum(["none","partial","heavy"]).optional().default("none"),
  occlusionReason: z.string().max(400).optional().default("").transform((value) => value.trim().slice(0, 160)),
});
const schema = z.object({
  colors: z.array(colorItem).min(1).max(6),
});

/** 让视觉模型用标准色名描述每个候选色，区分相近颜色。 */
async function nameColors(hexes: string[], runtime: Awaited<ReturnType<typeof resolveProductAnalysisModel>>) {
  if (!hexes.length) return {};
  const named = await requestTextJson(
    runtime,
    "你是服装颜色命名助手。依据每个 HEX 独立判断最贴切、可用于商品资料的标准中文颜色名。每个色款都必须单独命名，禁止使用“颜色1”“其他色”“同色系”“深色”等占位或含糊名称；必须重点区分相近颜色：黑色/深灰/炭灰、白色/米白/奶白/象牙白、棕色/深棕/咖色/巧克力棕、卡其/驼色/杏色/米色、蓝色/深蓝/藏蓝/牛仔蓝、绿色/军绿/墨绿/橄榄绿。只返回合法 JSON。",
    `颜色列表：${hexes.join(", ")}\n\n返回 {"names": {"#HEX": "颜色名"}}，必须覆盖列表里的每个 HEX，并逐个输出最准确的具体颜色名；不得为了让名称不同而虚构差异，也不要笼统地都用“棕色”或“蓝色”。`,
  );
  const parsed = (named as { names?: Record<string, string> }) || {};
  return parsed.names || {};
}

export type GarmentColorResult = {
  primaryColor: { name: string; hex: string; confidence: number } | null;
  secondaryColors: Array<{ name: string; hex: string; confidence: number }>;
  accentColors: Array<{ name: string; hex: string; confidence: number }>;
  colorVariants: Array<{ name: string; hex: string; order: number; confidence: number }>;
  confidence: number;
  needsReview: boolean;
  reviewReason?: string;
  /** 兼容旧接口：复色流程使用的色卡列表 */
  colors: Array<{ name: string; generationName:string; hex: string; trimColorName: string; trimHex: string; trimPart:string; confidence: number; boundingBox?: {x:number;y:number;width:number;height:number}; designDetails:string[]; materialFeatures:string; colorRegions:Array<{part:string;colorName:string;hex:string;confidence:number}>; isUniformColor:boolean; uniformColorConfidence:number; occlusion:"none"|"partial"|"heavy"; occlusionPolicy:"visible_only"|"extend_uniform"; occlusionReason:string; needsReview:boolean; reviewReason?:string }>;
};

export async function analyzeGarmentColors(imageUrl: string): Promise<GarmentColorResult> {
  const [visionRuntime, textRuntime, input] = await Promise.all([
    resolveProductAnalysisModel(),
    resolveProductAnalysisModel("fallback"),
    localImage(imageUrl),
  ]);
  const normalized = await resizeToJpeg(input, 1600, 90);

  // 本地结构化聚类：白平衡 + 排除肤色/阴影/高光，得到主/辅/点缀色的真实 HEX 与占比
  const structured = await extractStructuredColors(normalized);
  const allHexes = [...new Set((structured.colorVariants || []).map((item) => item.hex))];

  try {
    // 视觉模型：定位服装区域并给出标准颜色名与边饰色
    const observation = await requestVisionText(
      visionRuntime,
      toDataUrl(normalized, "image/jpeg"),
      "你是电商服装图片颜色识别助手。先定位图片中的目标服装区域，只分析服装本体，彻底忽略人物、背景、皮肤、头发、鞋子、道具、衣架、文字、阴影和高光。必须区分相近颜色，不确定时明确说明，不要猜测。",
      "观察服装的颜色构成：主色、辅色（面积较大的第二种颜色，如侧条纹、拼接）、点缀色（纽扣、印花、小面积边饰）。重点区分相近颜色：黑色/深灰/炭灰、白色/米白/奶白、棕色/深棕/咖色、卡其/驼色/杏色/米色、蓝色/深蓝/藏蓝/牛仔蓝、绿色/军绿/墨绿/橄榄绿。如果同一张图里有多个颜色款式，必须逐款分别说明：颜色和位置顺序；主体、包边、条纹、拼接、扣子、印花、面料分区等每个真实可见部位的独立颜色；口袋、条纹、拼接、扣子、印花、包边、车线、线条位置、面料分区等该色款独有设计；面料纹理、织法、光泽、厚薄和垂感；是否为整件统一单色；是否有折叠、遮挡或裁切。如果存在遮挡，只有在可见证据明确证明整件是统一单色时，才允许说明遮挡部分可延续可见主体色；只要存在拼色、撞色、条纹、包边、印花、分区色或无法判断，就必须说明不可推断。还要给出完整包含该颜色款整件可见服装的归一化外接框 boundingBox（x、y、width、height，范围0到1）。外接框必须包含领口、袖口、腰头、下摆、裤脚等全部可见服装，不能只框颜色小块，也不能混入相邻颜色款。",
    );
    const parsed = schema.parse(
      await requestTextJson(
        textRuntime,
        "你是服装色卡资料整理助手。只能依据图片识别结果整理色卡，必须只返回合法 JSON。",
        `图片识别结果：\n${observation}\n\n返回 {"colors": [...]}，最多6项；按图片中服装款式从左到右/从上到下给出顺序。每项包含 name（主体色的具体标准中文名称）、hex、trimColorName（真实可见的主要边饰/局部色名称，没有则为空字符串）、trimHex（没有边饰则为空字符串）、trimPart（辅色所在部位，只能是“包边、条纹、扣子、拼接、印花、撞色、线条、边”之一，没有则为空字符串）、confidence（0到1）、designDetails（该色款真实可见的口袋/条纹/拼接/扣子/印花/包边/车线/线条位置/面料分区数组）、materialFeatures（面料纹理、织法、光泽、厚薄和垂感）、colorRegions（真实可见的局部配色数组，每项为 part、colorName、hex、confidence）、isUniformColor（只有整件明确统一单色且没有不同色包边/条纹/拼接/扣子/印花/分区时才为 true）、uniformColorConfidence、occlusion（none/partial/heavy）、occlusionReason 和可选 boundingBox（完整色款服装的归一化 x、y、width、height）。名称必须具体、稳定，重点区分黑色/炭黑/深灰、白色/米白/奶油白/象牙白、棕色/焦糖棕/栗棕/巧克力棕/深咖啡、卡其/黄褐卡其/深卡其/驼色/杏色、蓝色/藏青/牛仔蓝/雾霾蓝、绿色/军绿/墨绿/橄榄绿；禁止使用“颜色1、深色、浅色、其他色、同色系”等含糊名称。materialFeatures 必须是一段字符串，例如“细密针织纹理，哑光，中等厚度，垂感自然”，不得返回对象或数组。主色必须按服装主体面积判断，不能被小面积条纹/印花取代；每个局部颜色必须来自参考图真实可见证据，名称或标题不得替代看图判断。若有遮挡：只有 isUniformColor=true 且 uniformColorConfidence>=0.75 时，才表示遮挡部分可延续可见主体色；存在拼色、包边、条纹、印花、面料分区或无法判断时必须 isUniformColor=false。边饰色和部位必须来自真实可见内容，没有就留空，禁止为了凑字段而猜测；boundingBox 必须完整包含该颜色款服装，不能只框颜色小块或混入相邻款；只依据服装区域，背景、皮肤、头发、鞋子、道具、阴影和高光不得参与。所有非空 HEX 必须为 #RRGGBB。`,
      ),
    );

    // 将视觉语义、真实 HEX 和相近色命名表交叉校准；每个色款都必须得到独立、具体的名称。
    const variantHexes = parsed.colors.map((item) => item.hex.toUpperCase());
    const visionNames = await nameColors([...new Set([...allHexes, ...variantHexes])], textRuntime);
    const resolvedColors = parsed.colors.map((item) => {
      const upper = item.hex.toUpperCase();
      const hexName=visionNames[upper]?.trim()||readableColorName(upper,[]);
      const name=chooseSpecificColorName(item.name,hexName);
      const trimPart=normalizeTrimPart(item.trimPart,item.designDetails);
      const colorRegions=item.colorRegions.map(region=>({...region,hex:region.hex.toUpperCase()}));
      const occlusionPolicy:"visible_only"|"extend_uniform"=item.occlusion!=="none"&&item.isUniformColor&&item.uniformColorConfidence>=0.75?"extend_uniform":"visible_only";
      const occlusionNeedsReview=item.occlusion!=="none"&&occlusionPolicy!=="extend_uniform";
      const reviewReason=occlusionNeedsReview
        ?item.occlusionReason||"参考图存在遮挡，且无法确认整件服装为统一颜色，禁止自动推断遮挡区域"
        :undefined;
      return {...item,hex:upper,trimHex:item.trimHex.toUpperCase(),name,trimPart,colorRegions,generationName:generationColorName(name,item.trimColorName,trimPart),occlusionPolicy,needsReview:occlusionNeedsReview,reviewReason};
    });
    const nameOf = (hex: string) => {
      const upper = hex.toUpperCase();
      if (visionNames[upper]) return visionNames[upper];
      return readableColorName(upper, []);
    };

    const primaryHex = structured.primaryColor?.hex.toUpperCase();
    const visionPrimary = resolvedColors[0];
    const primaryColor = primaryHex
      ? {
          name: visionNames[primaryHex] || visionPrimary?.name || readableColorName(primaryHex, []),
          hex: primaryHex,
          confidence: structured.primaryColor!.confidence,
        }
      : null;

    const secondaryColors = structured.secondaryColors.map((item) => ({
      name: nameOf(item.hex),
      hex: item.hex,
      confidence: item.confidence,
    }));
    const accentColors = structured.accentColors.map((item) => ({
      name: nameOf(item.hex),
      hex: item.hex,
      confidence: item.confidence,
    }));
    const colorVariants = structured.colorVariants.map((item) => ({
      name: nameOf(item.hex),
      hex: item.hex,
      order: item.order,
      confidence: item.confidence,
    }));

    // 多色款：如果视觉模型识别到多个颜色，且本地聚类也确认了多种主色，合并为变体列表
    const missingVariantBox = resolvedColors.some((item) => !item.boundingBox);
    const missingTrimPart = resolvedColors.some((item) => Boolean(item.trimColorName) && !item.trimPart);
    const needsReview = structured.needsReview || resolvedColors.some((item) => item.needsReview || (item.confidence ?? 0.5) < 0.65) || resolvedColors.length > 4 || missingVariantBox || missingTrimPart;
    const reviewReason = structured.needsReview
      ? structured.reviewReason
      : missingVariantBox
        ? "部分颜色款未可靠定位，需要人工框选该颜色款的整件服装"
      : missingTrimPart
        ? "识别到了辅色，但未能确认辅色位于包边、条纹或其他部位，需要人工确认"
      : resolvedColors.some((item) => item.needsReview)
        ? resolvedColors.find((item) => item.needsReview)?.reviewReason || "部分颜色款存在遮挡或不可见区域，需要人工确认"
      : resolvedColors.some((item) => (item.confidence ?? 0.5) < 0.65)
        ? "存在颜色置信度较低或相近色，建议人工确认"
        : resolvedColors.length > 4
          ? "识别到多种颜色款式，建议人工确认"
        : undefined;

    return {
      primaryColor,
      secondaryColors,
      accentColors,
      colorVariants,
      confidence: primaryColor ? Math.round(primaryColor.confidence * 100) : structured.confidence,
      needsReview,
      reviewReason,
      colors: resolvedColors,
    };
  } catch (error) {
    throw new Error(`颜色识别失败：${error instanceof Error ? error.message : "未知错误"}`);
  }
}
