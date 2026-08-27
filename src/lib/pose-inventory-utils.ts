export type PoseInventoryGroupLike = {
  poseGroupId: string;
  folderName: string;
  folderRelativePath: string;
  productType?: string;
  productSubtype?: string;
  displayFocus?: string;
  shotType?: string;
  faceVisible?: boolean;
  tags?: string;
};

export const PRODUCT_TYPES = ["上衣", "裤装", "连衣裙", "半身裙", "套装"] as const;

export function normalizeProductType(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower.includes("上衣") || lower.includes("top")) return "上衣";
  if (lower.includes("裤") || lower.includes("pants") || lower.includes("trousers")) return "裤装";
  if (lower.includes("连衣裙") || lower.includes("dress")) return "连衣裙";
  if (lower.includes("半身裙") || lower.includes("skirt") || lower.includes("裙")) return "半身裙";
  if (lower.includes("套装") || lower.includes("suit") || lower.includes("set")) return "套装";
  return undefined;
}

export function normalizeShot(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower.includes("全身") || lower.includes("full")) return "全身";
  if (lower.includes("上半身") || lower.includes("upper")) return "上半身";
  if (lower.includes("下半身") || lower.includes("lower")) return "下半身";
  if (lower.includes("半身") || lower.includes("half")) return "半身";
  return undefined;
}

export function normalizeFace(value?: string): boolean | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (["是", "露脸", "yes", "true", "1", "visible"].includes(lower)) return true;
  if (["否", "不露脸", "no", "false", "0", "hidden"].includes(lower)) return false;
  return undefined;
}

/** 规则推荐：按 商品子类 > 商品类型 > 景别 > 露脸 > 展示重点 计算匹配度。 */
export function recommendGroups(
  groups: PoseInventoryGroupLike[],
  target: { productType?: string; productSubtype?: string; shotType?: string; faceVisible?: boolean },
): Array<{ group: PoseInventoryGroupLike; score: number; reasons: string[] }> {
  return groups
    .map((group) => {
      let score = 0;
      const reasons: string[] = [];
      if (target.productType && group.productType === target.productType) {
        score += 35;
        reasons.push(`商品类型：${group.productType}`);
      }
      if (target.productSubtype && group.productSubtype && group.productSubtype.includes(target.productSubtype)) {
        score += 25;
        reasons.push(`商品子类：${group.productSubtype}`);
      }
      if (target.shotType && group.shotType === target.shotType) {
        score += 20;
        reasons.push(`景别：${group.shotType}`);
      }
      if (target.faceVisible !== undefined && group.faceVisible === target.faceVisible) {
        score += 12;
        reasons.push(`${group.faceVisible ? "露脸" : "不露脸"}`);
      }
      if (target.productSubtype && group.displayFocus && group.displayFocus.includes(target.productSubtype)) {
        score += 8;
        reasons.push(`展示重点：${group.displayFocus}`);
      }
      return { group, score: Math.min(100, score), reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export function searchGroups(
  groups: PoseInventoryGroupLike[],
  query: string,
  filter: { productType?: string; shotType?: string; face?: string },
): PoseInventoryGroupLike[] {
  const q = query.trim().toLowerCase();
  return groups.filter((group) => {
    if (filter.productType && group.productType !== filter.productType) return false;
    if (filter.shotType && group.shotType !== filter.shotType) return false;
    if (filter.face === "露脸" && group.faceVisible !== true) return false;
    if (filter.face === "不露脸" && group.faceVisible !== false) return false;
    if (!q) return true;
    const haystack = [group.poseGroupId, group.productType, group.productSubtype, group.tags, group.displayFocus, group.folderName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
