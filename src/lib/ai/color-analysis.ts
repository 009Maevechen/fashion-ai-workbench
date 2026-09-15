import "server-only";
import { z } from "zod";
import { resolveProductAnalysisModel } from "./provider-settings";
import { localImage, toDataUrl } from "./storage";
import { requestMultiVisionJson, requestVisionJson } from "./vision-chat";
import { readableColorName } from "../color-palette";
import { extractStructuredColors } from "../structured-color";
import { resizeToJpeg } from "../image-limits";
import { chooseSpecificColorName, generationColorName, isButtonColorPart, isComplexColorPart, normalizeColorAnalysisPayload, normalizeMaterialFeatures, normalizeTrimPart } from "./color-analysis-normalize";
import {recolorStructureNeedsReview,resolveRecolorStructureMode} from "../recolor-structure";
import {localColorFallbackResult,visualFailureReason} from "./color-analysis-fallback";
import { colorAnalysisCacheKey, getCachedColorAnalysis, putCachedColorAnalysis } from "../color-analysis-cache";

const normalizedBox = z.object({
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
  width: z.coerce.number().positive().max(1),
  height: z.coerce.number().positive().max(1),
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
  styleRelation: z.enum(["same","explicit_difference","uncertain"]).optional().default("uncertain"),
  structureDifferenceConfidence: z.number().min(0).max(1).optional().default(0.5),
  structureDifferences: z.array(shortDesignDetail).max(12).optional().default([]),
});
const schema = z.object({
  colors: z.array(colorItem).min(1).max(6),
});

export type GarmentColorResult = {
  primaryColor: { name: string; hex: string; confidence: number } | null;
  secondaryColors: Array<{ name: string; hex: string; confidence: number }>;
  accentColors: Array<{ name: string; hex: string; confidence: number }>;
  colorVariants: Array<{ name: string; hex: string; order: number; confidence: number }>;
  confidence: number;
  needsReview: boolean;
  reviewReason?: string;
  /** 兼容旧接口：复色流程使用的色卡列表 */
  colors: Array<{ name: string; generationName:string; hex: string; trimColorName: string; trimHex: string; trimPart:string; confidence: number; boundingBox?: {x:number;y:number;width:number;height:number}; designDetails:string[]; materialFeatures:string; colorRegions:Array<{part:string;colorName:string;hex:string;confidence:number}>; isUniformColor:boolean; uniformColorConfidence:number; occlusion:"none"|"partial"|"heavy"; occlusionPolicy:"visible_only"|"extend_uniform"; occlusionReason:string; styleRelation:"same"|"explicit_difference"|"uncertain"; structureMode:"same_style"|"explicit_variant"; structureDifferenceConfidence:number; structureDifferences:string[]; needsReview:boolean; reviewReason?:string }>;
};

export async function analyzeGarmentColors(
  imageUrl: string,
  baseStyleImageUrl?: string,
  options: { force?: boolean } = {},
): Promise<GarmentColorResult> {
  const [visionRuntime, fallbackRuntime, input, baseInput] = await Promise.all([
    resolveProductAnalysisModel(),
    resolveProductAnalysisModel("fallback").catch(()=>undefined),
    localImage(imageUrl),
    baseStyleImageUrl&&baseStyleImageUrl!==imageUrl?localImage(baseStyleImageUrl):Promise.resolve(undefined),
  ]);
  const cacheKey = colorAnalysisCacheKey(input, baseInput);
  if (!options.force) {
    const cached = await getCachedColorAnalysis<GarmentColorResult>(cacheKey);
    if (cached?.colors?.length) return cached;
  }
  const [normalized,normalizedBase]=await Promise.all([
    resizeToJpeg(input,1280,88),
    baseInput?resizeToJpeg(baseInput,1280,88):Promise.resolve(undefined),
  ]);

  try {
    // 视觉模型：定位服装区域并给出标准颜色名与边饰色
    const system="你是电商服装颜色款识别助手。普通款只识别每一款服装的主体颜色；扣子和统一五金从原款继承，不参与颜色名称或复色映射。只有清晰可见的条纹、包边、拼接、撞色、印花等复杂多色设计才逐部位分析。参考图可能是正面/背面/侧面/细节/平铺/上身等任意视角，必须先判断视角与可见范围，再只依据真实可见内容识别，不因角度、褶皱、透视或光影把同一颜色误判成深浅两个颜色，也不把局部特写颜色当成整件主体色。必须忽略人物、背景、皮肤、头发、鞋子、道具、衣架、文字、阴影和高光。默认所有颜色款都是同款不同色，只有直接、清晰、可复核的视觉证据才能认定结构差异；不确定时保持原款结构并标记不确定，禁止猜测。";
    const observationPrompt=`${normalizedBase?"图片顺序：第1张是三姿势已确认图/原款结构基准，第2张是多颜色参考图。第1张负责版型、结构、扣子等五金和布局，第2张主要提供每一颜色款的主体颜色；只有复杂多色款才提供条纹、包边、拼接、撞色、印花等局部颜色。":"当前只有颜色参考图，无法与原款直接比对，因此所有颜色款默认按同款结构处理。"}\n优先快速识别每个颜色款的主体色。重点区分相近颜色：黑色/深灰/炭灰、白色/米白/奶白、棕色/深棕/咖色、卡其/驼色/杏色/米色、蓝色/深蓝/藏蓝/牛仔蓝、绿色/军绿/墨绿/橄榄绿。如果参考图里有多个颜色款，逐款识别并按从左到右/从上到下排序。扣子、纽扣及统一五金不得写入 name、trimColorName、trimPart、generationName 或 colorRegions；扣子数量和结构只作为设计观察保留。普通单色款的 trimColorName、trimHex、trimPart 和 colorRegions 必须为空。只有条纹、包边、拼接、撞色、印花等复杂多色款才填写这些局部颜色。不得把小面积五金、阴影或高光当成服装配色。\n只返回 {"colors":[...]}，最多6项。每项字段类型必须严格为：name:string，hex:"#RRGGBB"，trimColorName:string，trimHex:"#RRGGBB"或""，trimPart:string，confidence:0到1数字，boundingBox:{x,y,width,height}（0到1），designDetails:string[]，materialFeatures:string，colorRegions:[{part:string,colorName:string,hex:"#RRGGBB"或"",confidence:0到1数字}]，isUniformColor:boolean，uniformColorConfidence:0到1数字，occlusion:"none"|"partial"|"heavy"，occlusionReason:string，styleRelation:"same"|"explicit_difference"|"uncertain"，structureDifferenceConfidence:0到1数字，structureDifferences:string[]。数组和枚举类型必须严格遵守。styleRelation 默认 same；只有清晰、直接且不是遮挡、折叠或视角造成的差异才可为 explicit_difference。${normalizedBase?"必须以第1张原款图作为版型和设计布局基准。":"没有原款对比图时禁止判定 explicit_difference。"}无法确认时降低置信度，不得猜测。`;
    const requestAnalysis=(runtime:typeof visionRuntime)=>normalizedBase
      ?requestMultiVisionJson(runtime,[toDataUrl(normalizedBase,"image/jpeg"),toDataUrl(normalized,"image/jpeg")],system,observationPrompt)
      :requestVisionJson(runtime,toDataUrl(normalized,"image/jpeg"),system,observationPrompt);
    const distinctFallback=fallbackRuntime&&(
      fallbackRuntime.id!==visionRuntime.id||fallbackRuntime.model!==visionRuntime.model
    )?fallbackRuntime:undefined;
    const visionRequest=requestAnalysis(visionRuntime).catch(async primaryError=>{
      if(!distinctFallback)throw primaryError;
      try{return await requestAnalysis(distinctFallback)}catch(fallbackError){
        throw new Error(`主视觉模型失败：${visualFailureReason(primaryError)}；备用视觉模型失败：${visualFailureReason(fallbackError)}`);
      }
    });
    // 本地白平衡/聚类与远程视觉识别并行，减少一次识别的总等待时间。
    const [structured,remoteAnalysis]=await Promise.all([
      extractStructuredColors(normalized),
      visionRequest.then(raw=>({ok:true as const,raw})).catch(error=>({ok:false as const,error})),
    ]);
    if(!remoteAnalysis.ok)return localColorFallbackResult(structured,remoteAnalysis.error);
    const rawAnalysis=remoteAnalysis.raw;
    const parsed = schema.parse(normalizeColorAnalysisPayload(rawAnalysis));

    // 视觉语义与本地 Lab 感知色差表交叉校准，不再额外调用一次颜色命名模型。
    const detectedNames=new Map(parsed.colors.map(item=>[item.hex.toUpperCase(),item.name]));
    const resolvedColors = parsed.colors.map((item) => {
      const upper = item.hex.toUpperCase();
      const hexName=readableColorName(upper,[]);
      const name=chooseSpecificColorName(item.name,hexName);
      const detectedTrimPart=normalizeTrimPart(item.trimPart,item.designDetails);
      const colorRegions=item.colorRegions
        .filter(region=>!isButtonColorPart(region.part))
        .map(region=>({...region,hex:region.hex.toUpperCase()}));
      const complexColorway=isComplexColorPart(detectedTrimPart)||colorRegions.some(region=>isComplexColorPart(region.part));
      const trimPart=complexColorway?detectedTrimPart:"";
      const trimColorName=complexColorway?item.trimColorName:"";
      const trimHex=complexColorway?item.trimHex.toUpperCase():"";
      const occlusionPolicy:"visible_only"|"extend_uniform"=item.occlusion!=="none"&&item.isUniformColor&&item.uniformColorConfidence>=0.75?"extend_uniform":"visible_only";
      const occlusionNeedsReview=item.occlusion!=="none"&&occlusionPolicy!=="extend_uniform";
      const structureMode=resolveRecolorStructureMode(item.styleRelation,item.structureDifferenceConfidence,item.structureDifferences);
      const structureNeedsReview=recolorStructureNeedsReview(item.styleRelation,item.structureDifferenceConfidence,item.structureDifferences,item.occlusion);
      const reviewReason=structureNeedsReview
        ?"颜色款结构差异证据不足或被遮挡，请确认；未确认前必须沿用原款布局"
        :occlusionNeedsReview
        ?item.occlusionReason||"参考图存在遮挡，且无法确认整件服装为统一颜色，禁止自动推断遮挡区域"
        :undefined;
      return {...item,hex:upper,trimColorName,trimHex,name,trimPart,colorRegions,generationName:generationColorName(name,trimColorName,trimPart),occlusionPolicy,structureMode,needsReview:occlusionNeedsReview||structureNeedsReview,reviewReason};
    });
    const nameOf = (hex: string) => {
      const upper = hex.toUpperCase();
      return chooseSpecificColorName(detectedNames.get(upper),readableColorName(upper, []));
    };

    const primaryHex = structured.primaryColor?.hex.toUpperCase();
    const visionPrimary = resolvedColors[0];
    const primaryColor = primaryHex
      ? {
          name: chooseSpecificColorName(
            detectedNames.get(primaryHex) || visionPrimary?.name,
            readableColorName(primaryHex, []),
          ),
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
    const missingRegionColorName = resolvedColors.some((item) =>
      item.colorRegions.some((region) => region.colorName === "待人工确认"),
    );
    const needsReview = structured.needsReview || resolvedColors.some((item) => item.needsReview || (item.confidence ?? 0.5) < 0.65) || resolvedColors.length > 4 || missingVariantBox || missingTrimPart || missingRegionColorName;
    const reviewReason = structured.needsReview
      ? structured.reviewReason
      : missingVariantBox
        ? "部分颜色款未可靠定位，需要人工框选该颜色款的整件服装"
      : missingTrimPart
        ? "识别到了辅色，但未能确认辅色位于包边、条纹或其他部位，需要人工确认"
      : missingRegionColorName
        ? "部分局部颜色名称无法从参考图可靠确认，需要人工检查"
      : resolvedColors.some((item) => item.needsReview)
        ? resolvedColors.find((item) => item.needsReview)?.reviewReason || "部分颜色款存在遮挡或不可见区域，需要人工确认"
      : resolvedColors.some((item) => (item.confidence ?? 0.5) < 0.65)
        ? "存在颜色置信度较低或相近色，建议人工确认"
        : resolvedColors.length > 4
          ? "识别到多种颜色款式，建议人工确认"
        : undefined;

    const result: GarmentColorResult = {
      primaryColor,
      secondaryColors,
      accentColors,
      colorVariants,
      confidence: primaryColor ? Math.round(primaryColor.confidence * 100) : structured.confidence,
      needsReview,
      reviewReason,
      colors: resolvedColors,
    };
    await putCachedColorAnalysis(cacheKey, result);
    return result;
  } catch (error) {
    throw new Error(`颜色识别失败：${error instanceof Error ? error.message : "未知错误"}`);
  }
}
