import type {ProductProfile,ProductType} from "./db";

export const DEFAULT_PROTECTION_ITEMS=["保持领口","保持袖型","保持衣长","保持白色包边","保持黑色包边","保持纽扣数量","保持印花位置","保持面料纹理","保持口袋","保持腰带","保持左右结构"];
export const TRYON_SAFETY_ITEMS=["禁止改变服装类别","禁止把上衣生成裙子","禁止延长衣长","保持原始下摆","保持纽扣数量","保持包边","保持印花","保持面料纹理"];

const labels:Record<string,string>={fit:"版型",garmentLength:"衣长",neckline:"领型",sleeveType:"袖型",placketType:"门襟",buttonCount:"纽扣数量",pocketDetails:"口袋",trimColor:"包边颜色",printPosition:"印花位置",asymmetry:"左右结构",fabric:"面料",fabricTexture:"面料纹理",belt:"腰带",drawstring:"抽绳",pleats:"褶皱",slit:"开叉",mainColor:"主色",printType:"印花类型"};

export function buildProductProtectionPrompt(productType:ProductType,profile?:ProductProfile){
  const attributes=profile?.attributes||{};
  const structure=Object.entries(attributes).filter(([,value])=>Boolean(value)).map(([key,value])=>`${labels[key]||key}：${value}`).join("；");
  const protection=[...new Set([...(profile?.protectionItems||DEFAULT_PROTECTION_ITEMS),...TRYON_SAFETY_ITEMS])].join("；");
  const category=productType==="上衣"?"这是一件上衣，不是裙子、连衣裙或长款外套。禁止延长下摆，禁止改变服装类别。":`这是一件${productType}，禁止把它改变为其他服装类别。`;
  return [category,structure&&`商品结构：${structure}。`,`严格保护：${protection}。`,profile?.detailDescription&&`商品细节：${profile.detailDescription}`].filter(Boolean).join("\n");
}
