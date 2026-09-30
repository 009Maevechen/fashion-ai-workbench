import type { ProductAttributes, ProductProfile } from "./db";

export type ProductProfileAnalysis = {
  attributes?: ProductAttributes;
  detailDescription?: string;
  protectionItems?: string[];
};

/**
 * 把产品图识别结果写入商品资料，同时严格保护用户手工修改和已确认内容。
 * 该合并函数同时供自动导入和手动重新识别使用，避免两条入口产生不同结果。
 */
export function mergeProductProfileAnalysis(
  current: ProductProfile | undefined,
  analysis: ProductProfileAnalysis,
): ProductProfile {
  const profile = current || {};
  if (profile.reviewStatus === "confirmed") return profile;

  const manualAttributeKeys = new Set(profile.manualAttributeKeys || []);
  const attributes: ProductAttributes = { ...(profile.attributes || {}) };
  for (const [rawKey, value] of Object.entries(analysis.attributes || {})) {
    const key = rawKey as keyof ProductAttributes;
    if (!manualAttributeKeys.has(key) && value) attributes[key] = value;
  }

  return {
    ...profile,
    attributes,
    detailDescription: analysis.detailDescription?.trim() || profile.detailDescription,
    protectionItems: profile.manualProtectionEdited
      ? profile.protectionItems
      : analysis.protectionItems?.length
        ? analysis.protectionItems
        : profile.protectionItems,
    reviewStatus: "awaiting_review",
  };
}
