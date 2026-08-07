import type {ProductType} from "./db";

export type RecolorGarmentArea="上衣"|"裤子"|"裙子"|"整套服装";

export function recolorAreaForProductType(productType:ProductType):RecolorGarmentArea{
  if(productType==="上衣")return "上衣";
  if(productType==="裤装")return "裤子";
  if(productType==="连衣裙"||productType==="半身裙")return "裙子";
  return "整套服装";
}

export function protectedClothingForArea(area:RecolorGarmentArea){
  if(area==="上衣")return "裤子、裙子、腰带、鞋子、包袋及其他下装和配饰";
  if(area==="裤子")return "上衣、内搭、外套、鞋子、包袋及其他非裤装服饰";
  if(area==="裙子")return "上衣、内搭、外套、鞋子、包袋及其他非裙装服饰";
  return "鞋子、包袋、帽子、首饰及非目标套装的其他物品";
}
