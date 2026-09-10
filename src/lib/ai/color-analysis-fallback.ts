import {readableColorName} from "../color-palette";
import type {StructuredColorResult} from "../structured-color";

export function visualFailureReason(error:unknown){
  const message=error instanceof Error?error.message:String(error||"未知错误");
  if(/all available accounts exhausted|no available accounts?|account pool.*exhausted/i.test(message))
    return "视觉中转站账号池已耗尽（All available accounts exhausted）";
  if(/quota|insufficient_quota|余额|额度/i.test(message))return "视觉模型额度不足";
  if(/rate.?limit|too many requests|HTTP 429/i.test(message))return "视觉模型当前请求过多";
  return message;
}

/**
 * 远程视觉模型不可用时的安全降级：只使用本地像素分析建立待确认色卡。
 * 不推断款式、扣子或局部设计，也不把本地结果冒充为 AI 视觉识别结果。
 */
export function localColorFallbackResult(structured:StructuredColorResult,remoteError:unknown){
  const candidates=structured.colorVariants.slice(0,6);
  if(!candidates.length)throw remoteError;
  const usedNames:string[]=[];
  const colors=candidates.map(item=>{
    const name=readableColorName(item.hex,usedNames);
    usedNames.push(name);
    return {
      name,
      generationName:name,
      hex:item.hex.toUpperCase(),
      trimColorName:"",
      trimHex:"",
      trimPart:"",
      confidence:item.confidence,
      designDetails:[] as string[],
      materialFeatures:"",
      colorRegions:[] as Array<{part:string;colorName:string;hex:string;confidence:number}>,
      isUniformColor:false,
      uniformColorConfidence:0,
      occlusion:"none" as const,
      occlusionPolicy:"visible_only" as const,
      occlusionReason:"",
      styleRelation:"same" as const,
      structureMode:"same_style" as const,
      structureDifferenceConfidence:0,
      structureDifferences:[] as string[],
      needsReview:true,
      reviewReason:"视觉模型暂不可用，本次色卡来自本地白平衡与 Lab 颜色分析，请人工确认并框选对应服装",
    };
  });
  const nameOf=(hex:string)=>colors.find(item=>item.hex===hex.toUpperCase())?.name||readableColorName(hex,usedNames);
  const primaryColor=structured.primaryColor?{
    name:nameOf(structured.primaryColor.hex),
    hex:structured.primaryColor.hex.toUpperCase(),
    confidence:structured.primaryColor.confidence,
  }:null;
  return {
    primaryColor,
    secondaryColors:structured.secondaryColors.map(item=>({name:nameOf(item.hex),hex:item.hex.toUpperCase(),confidence:item.confidence})),
    accentColors:structured.accentColors.map(item=>({name:nameOf(item.hex),hex:item.hex.toUpperCase(),confidence:item.confidence})),
    colorVariants:structured.colorVariants.map(item=>({name:nameOf(item.hex),hex:item.hex.toUpperCase(),order:item.order,confidence:item.confidence})),
    confidence:structured.confidence,
    needsReview:true,
    reviewReason:`${visualFailureReason(remoteError)}。已自动切换本地颜色分析，结果需要人工确认；不会重复消耗模型请求。`,
    colors,
  };
}
