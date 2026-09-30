import type { GarmentProductionProfile } from "./sku-production";

/** 图片识别使用的三级服装分类词库。第三级由可见版型/长度等组成，不从标题推断。 */
export const GARMENT_TAXONOMY = {
  上衣: ["T恤", "衬衫", "针织衫", "毛衣", "开衫", "卫衣", "背心", "马甲", "吊带", "Polo衫", "打底衫", "抹胸"],
  裤子: ["牛仔裤", "阔腿裤", "运动裤", "瑜伽裤", "工装裤", "休闲裤", "西裤", "短裤", "直筒裤", "喇叭裤", "紧身裤", "连体裤"],
  裙子: ["半身裙", "A字裙", "百褶裙", "包臀裙", "鱼尾裙", "牛仔裙", "长裙", "短裙", "伞裙"],
  连衣裙: ["吊带裙", "针织裙", "衬衫裙", "裹身裙", "A字连衣裙", "直筒连衣裙", "长款连衣裙", "短款连衣裙"],
  外套: ["西装外套", "夹克", "风衣", "大衣", "羽绒服", "棉服", "牛仔外套", "皮衣", "披肩", "开衫外套"],
  套装: ["西装套装", "运动套装", "针织套装", "上衣裤子套装", "上衣裙子套装", "两件套", "三件套"],
  运动服: ["运动上衣", "运动背心", "运动内衣", "运动短裤", "运动长裤", "运动连体衣", "瑜伽服"],
  内搭: ["打底衫", "保暖内衣", "内衣", "文胸", "吊带背心", "塑身衣", "衬裙"],
  泳装: ["连体泳衣", "比基尼", "泳裤", "泳裙", "防晒泳衣", "泳装套装"],
  礼服: ["晚礼服", "鸡尾酒礼服", "婚纱", "伴娘礼服", "宴会礼服", "礼服套装"],
  配饰: ["围巾", "帽子", "手套", "腰带", "披肩", "领带", "袜子", "包袋"],
} as const;

export type GarmentCategory = keyof typeof GARMENT_TAXONOMY;
export const GARMENT_CATEGORIES = Object.keys(GARMENT_TAXONOMY) as GarmentCategory[];
export type GarmentClassificationField =
  | "category" | "subcategory" | "garmentType" | "style" | "fit"
  | "length" | "silhouette" | "material" | "season" | "gender" | "displayFocus";
export const GARMENT_CLASSIFICATION_FIELDS: GarmentClassificationField[] = [
  "category", "subcategory", "garmentType", "style", "fit", "length",
  "silhouette", "material", "season", "gender", "displayFocus",
];
export type GarmentClassification = Record<GarmentClassificationField, string> & {
  confidence: number;
  needsReview: boolean;
  issues: string[];
};

export function isGarmentCategory(value: string): value is GarmentCategory {
  return Object.hasOwn(GARMENT_TAXONOMY, value);
}

export function isGarmentSubcategory(category: GarmentCategory, value: string) {
  return (GARMENT_TAXONOMY[category] as readonly string[]).includes(value);
}

/** 旧服装细节锁的自由文本只能依据图片所见的明确类目归类，不能靠商品标题补猜。 */
export function categoryFromVisualLabels(category: string, subcategory = ""): GarmentCategory | "" {
  const visibleCategory = category.trim();
  if (isGarmentCategory(visibleCategory)) return visibleCategory;
  const aliases: Record<string, GarmentCategory> = { 上装: "上衣", 裤装: "裤子", 半身裙: "裙子" };
  if (aliases[visibleCategory]) return aliases[visibleCategory];
  const matches = GARMENT_CATEGORIES.filter((candidate) => isGarmentSubcategory(candidate, subcategory.trim()));
  return matches.length === 1 ? matches[0] : "";
}

export function validateGarmentClassification(value: GarmentClassification): GarmentClassification {
  const issues = [...value.issues];
  if (!isGarmentCategory(value.category)) issues.push("商品大类无法从产品图确认");
  else if (!isGarmentSubcategory(value.category, value.subcategory))
    issues.push("商品子类不在对应大类词库中，请人工确认");
  if (!value.garmentType.trim()) issues.push("具体服装名称无法从产品图确认");
  const unresolved = GARMENT_CLASSIFICATION_FIELDS.filter((field) =>
    !["category", "subcategory", "garmentType"].includes(field) &&
    (!value[field]?.trim() || value[field] === "无法从图片确认"),
  );
  if (unresolved.length) issues.push(`以下属性无法从产品图确认：${unresolved.join("、")}`);
  if (value.confidence < 0.7) issues.push("服装类型识别置信度较低，请人工确认");
  return { ...value, issues: [...new Set(issues)], needsReview: issues.length > 0 || value.needsReview };
}

/** 旧版生成接口只接受五类；细分类保留在视觉资料中供提示词和质检使用。 */
export function legacyProductType(category: string, subcategory = "") {
  if (category === "裤子" || subcategory.includes("裤")) return "裤装" as const;
  if (category === "裙子") return "半身裙" as const;
  if (category === "连衣裙" || subcategory.includes("连体") || (category === "礼服" && !subcategory.includes("套装"))) return "连衣裙" as const;
  if (category === "套装" || subcategory.includes("套装")) return "套装" as const;
  return "上衣" as const;
}

export function garmentClassificationText(value?: Partial<GarmentClassification>) {
  if (!value?.category) return "";
  return ["商品视觉分类（仅来自产品图）", value.category, value.subcategory,
    value.garmentType, value.fit, value.length, value.silhouette, value.style,
    value.material, value.season, value.gender, value.displayFocus]
    .filter((item) => item && item !== "无法从图片确认").join("；");
}

export function productionGarmentProfileText(value?: GarmentProductionProfile) {
  if (!value?.primaryCategory) return "";
  return garmentClassificationText({
    category: value.primaryCategory, subcategory: value.secondaryCategory,
    garmentType: value.garmentType, fit: value.fit, length: value.length,
    silhouette: value.silhouette, style: value.style, material: value.material,
    season: value.season, gender: value.gender, displayFocus: value.displayFocus,
  });
}

const profileKeys: Record<GarmentClassificationField, keyof GarmentProductionProfile> = {
  category: "primaryCategory", subcategory: "secondaryCategory", garmentType: "garmentType",
  style: "style", fit: "fit", length: "length", silhouette: "silhouette",
  material: "material", season: "season", gender: "gender", displayFocus: "displayFocus",
};

/** AI 只填未被人工保护的字段；表格中手工给出的类目也属于人工字段。 */
export function mergeGarmentClassification(
  existing: GarmentProductionProfile | undefined,
  detected: GarmentClassification,
  image: string,
): GarmentProductionProfile {
  const manual = new Set(existing?.manualFields || []);
  if (existing?.source === "spreadsheet") {
    if (existing.primaryCategory) manual.add("category");
    if (existing.secondaryCategory) manual.add("subcategory");
  }
  if (existing?.source === "manual") {
    for (const field of GARMENT_CLASSIFICATION_FIELDS) {
      const key = profileKeys[field];
      if (existing[key]) manual.add(field);
    }
  }
  const result: GarmentProductionProfile = {
    primaryCategory: detected.category as GarmentCategory,
    secondaryCategory: detected.subcategory,
    protectedDetails: existing?.protectedDetails || [],
    forbiddenChanges: existing?.forbiddenChanges || [],
    riskWarnings: existing?.riskWarnings || [],
    confidence: detected.confidence,
    source: existing?.source === "spreadsheet" ? "spreadsheet" : "ai",
    ...existing,
    sourceImage: image,
    analyzedAt: new Date().toISOString(),
    classificationConfirmed: existing?.classificationConfirmed || false,
    manualFields: [...manual],
  };
  for (const field of GARMENT_CLASSIFICATION_FIELDS) {
    if (result.classificationConfirmed || manual.has(field)) continue;
    const key = profileKeys[field];
    (result as unknown as Record<string, unknown>)[key] = detected[field];
  }
  result.category = result.primaryCategory;
  result.subcategory = result.secondaryCategory;
  result.confidence = result.classificationConfirmed ? existing?.confidence || 1 : detected.confidence;
  result.riskWarnings = [...new Set([...(existing?.riskWarnings || []), ...detected.issues])];
  if (existing?.classificationConfirmed && existing.sourceImage && existing.sourceImage !== image)
    result.riskWarnings = [...new Set([...result.riskWarnings, "产品图已更换，人工确认的分类已保留，请复核是否仍适用"])];
  if (detected.needsReview && !result.classificationConfirmed)
    result.riskWarnings = [...new Set([...result.riskWarnings, "服装类型需人工确认"])];
  if (result.primaryCategory === "配饰")
    result.riskWarnings = [...new Set([...result.riskWarnings, "现有换装与复色模型只支持服装，配饰分类已保存，但生成前需人工核对适用流程"])];
  return result;
}
