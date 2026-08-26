import type {ProductProfile,ProductType} from "./db";

export const DEFAULT_PROTECTION_ITEMS=["保持领口","保持袖型","保持衣长","保持白色包边","保持黑色包边","保持纽扣数量","保持印花位置","保持面料材质","保持面料纹理","保持织法结构","保持渐变设计","保持色块布局","保持特殊设计","保持口袋","保持腰带","保持左右结构"];
export const TRYON_SAFETY_ITEMS=["禁止改变服装类别","禁止把上衣生成裙子","禁止延长衣长","保持原始下摆","保持纽扣数量","保持包边","保持印花","保持面料材质","保持面料纹理","保持织法结构","保持渐变和色块布局"];

const labels:Record<string,string>={fit:"版型",garmentLength:"衣长",neckline:"领型",sleeveType:"袖型",placketType:"门襟",buttonCount:"纽扣数量",pocketDetails:"口袋",trimColor:"包边/拼接颜色",printPosition:"印花位置",asymmetry:"左右结构",fabric:"面料材质",fabricTexture:"面料纹理",weaveStructure:"织法结构",gradientDesign:"渐变设计",colorBlockLayout:"色块布局",specialDesign:"特殊设计",belt:"腰带",drawstring:"抽绳",pleats:"褶皱",slit:"开叉",mainColor:"主色",printType:"印花类型",transparency:"透明度",lining:"内衬",elasticity:"弹性"};

export function buildProductProtectionPrompt(productType:ProductType,profile?:ProductProfile){
  const attributes=profile?.attributes||{};
  const structure=Object.entries(attributes).filter(([,value])=>Boolean(value)).map(([key,value])=>`${labels[key]||key}：${value}`).join("；");
  const protection=[...new Set([...(profile?.protectionItems||DEFAULT_PROTECTION_ITEMS),...TRYON_SAFETY_ITEMS])].join("；");
  const category=productType==="上衣"?"这是一件上衣，不是裙子、连衣裙或长款外套。禁止延长下摆，禁止改变服装类别。":`这是一件${productType}，禁止把它改变为其他服装类别。`;
  return [category,structure&&`商品结构：${structure}。`,`严格保护：${protection}。`,profile?.detailDescription&&`商品细节：${profile.detailDescription}`,"跨流程材质与设计锁定：换装、姿势、复色和最终输出都必须保持同一商品的真实面料材质、粗细、织法、针法、罗纹走向、纹理密度、绒感、透视度、光泽、褶皱响应和垂坠感；不得把针织变成光滑布料，也不得磨平、重绘或虚构纹理。","跨流程结构与布局锁定：必须保持版型、轮廓、长度、领口、袖口、肩线、下摆、门襟、包边、拼接、渐变方向与过渡范围、色块边界与比例、纽扣、口袋、印花及特殊装饰的位置、形状、宽度、数量和层级一致；不得添加、删除、移动、替换或重新设计任何细节。"].filter(Boolean).join("\n");
}
