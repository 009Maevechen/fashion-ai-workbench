import type { ProductAttributes, ProductType } from "./db";

export type PromptModules = {
  /** 姿势描述 */
  poseDescription: string;
  /** 构图要求 */
  composition: string;
  /** 展示重点 */
  displayFocus: string;
  /** 人物要求 */
  personRequirement: string;
  /** 服装保护规则 */
  garmentProtection: string;
  /** 禁止修改项 */
  forbidden: string;
};

export type ProductBrief = {
  productType: ProductType;
  productSubtype?: string;
  displayFocus?: string;
  shotType?: string;
  faceVisible?: boolean;
  attributes?: ProductAttributes;
  protectionItems?: string[];
  detailDescription?: string;
};

export function emptyPromptModules(): PromptModules {
  return {
    poseDescription: "",
    composition: "",
    displayFocus: "",
    personRequirement: "",
    garmentProtection: "",
    forbidden: "",
  };
}

const LABELS: Record<string, string> = {
  fit: "版型",
  garmentLength: "衣长",
  neckline: "领型",
  sleeveType: "袖型",
  placketType: "门襟",
  buttonCount: "纽扣数量",
  pocketDetails: "口袋",
  trimColor: "包边/拼接颜色",
  printPosition: "印花位置",
  asymmetry: "左右结构",
  fabric: "面料材质",
  fabricTexture: "面料纹理",
  weaveStructure: "织法结构",
  gradientDesign: "渐变设计",
  colorBlockLayout: "色块布局",
  specialDesign: "特殊设计",
  mainColor: "主色",
  printType: "印花类型",
};

/** 从商品属性构建服装保护规则模块。 */
export function buildGarmentProtectionModule(brief: ProductBrief): string {
  const attributes = brief.attributes || {};
  const structure = Object.entries(attributes)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${LABELS[key] || key}：${value}`)
    .join("；");
  const protection = (brief.protectionItems && brief.protectionItems.length ? brief.protectionItems : [
    "保持领口",
    "保持袖型",
    "保持衣长",
    "保持包边",
    "保持纽扣数量",
    "保持印花位置",
    "保持面料材质",
    "保持面料纹理",
    "保持织法结构",
    "保持渐变设计",
    "保持色块布局",
  ]).join("；");
  const category = `这是一件${brief.productType}，禁止改变为其他服装类别。`;
  return [
    category,
    structure && `商品结构：${structure}。`,
    `严格保护：${protection}。`,
    brief.detailDescription && `商品细节：${brief.detailDescription}`,
  ].filter(Boolean).join("\n");
}

/** 组合各模块为最终 Prompt。 */
export function composePrompt(modules: PromptModules): string {
  const parts: string[] = [];
  if (modules.poseDescription) parts.push(`姿势要求：${modules.poseDescription}`);
  if (modules.composition) parts.push(`构图要求：${modules.composition}`);
  if (modules.displayFocus) parts.push(`展示重点：${modules.displayFocus}`);
  if (modules.personRequirement) parts.push(`人物要求：${modules.personRequirement}`);
  if (modules.garmentProtection) parts.push(`服装保护：\n${modules.garmentProtection}`);
  if (modules.forbidden) parts.push(`禁止修改项：${modules.forbidden}`);
  return parts.join("\n");
}
