import type { Project } from "./db";
import type { VisualReferenceImage, VisualReferencePoseGroup } from "./visual-reference";
import { buildGarmentProtectionModule, composePrompt, emptyPromptModules, type PromptModules } from "./visual-prompt";

export type VisualProductionPlan = {
  product: {
    productType: string;
    productSubtype?: string;
    displayFocus?: string;
    shotType?: string;
    faceVisible?: boolean;
  };
  recommendedFocus?: string;
  recommendedShot?: string;
  recommendedFace?: boolean;
  recommendedPoseGroup?: VisualReferencePoseGroup;
  poseImages: [string?, string?, string?];
  garmentProtection: string;
  risks: string[];
  prompt: string;
};

/** 计算参考图与当前商品的匹配度。规则评分，不依赖 Embedding。 */
export function scoreReference(
  ref: { productType?: string; productSubtype?: string; displayFocus?: string; shotType?: string; faceVisible?: boolean },
  target: { productType?: string; productSubtype?: string; shotType?: string; faceVisible?: boolean },
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (target.productType && ref.productType === target.productType) {
    score += 35;
    reasons.push(`商品类型：${ref.productType}`);
  }
  if (target.productSubtype && ref.productSubtype && ref.productSubtype.includes(target.productSubtype)) {
    score += 25;
    reasons.push(`商品子类：${ref.productSubtype}`);
  }
  if (target.shotType && ref.shotType === target.shotType) {
    score += 20;
    reasons.push(`景别：${ref.shotType}`);
  }
  if (target.faceVisible !== undefined && ref.faceVisible === target.faceVisible) {
    score += 12;
    reasons.push(`${ref.faceVisible ? "露脸" : "不露脸"}`);
  }
  if (target.productSubtype && ref.displayFocus && ref.displayFocus.includes(target.productSubtype)) {
    score += 8;
    reasons.push(`展示重点：${ref.displayFocus}`);
  }
  return { score: Math.min(100, score), reasons };
}

function projectBrief(project: Project) {
  const attributes = project.profile?.attributes || {};
  return {
    productType: project.productType,
    productSubtype: (attributes.fit && `${attributes.fit}`) || attributes.garmentLength || undefined,
    displayFocus: project.profile?.detailDescription || undefined,
    shotType: project.settings.pose?.shotType,
    faceVisible: project.settings.pose?.face,
  };
}

/** 从商品 + 参考图库生成视觉生产方案。 */
export function buildProductionPlan(
  project: Project,
  poseGroups: VisualReferencePoseGroup[],
  images: VisualReferenceImage[],
): VisualProductionPlan {
  const brief = projectBrief(project);
  const target = { productType: brief.productType, productSubtype: brief.productSubtype, shotType: brief.shotType, faceVisible: brief.faceVisible };

  // 评分所有姿势组
  const scoredGroups = poseGroups
    .map((group) => ({ group, ...scoreReference(group, target) }))
    .sort((a, b) => b.score - a.score);

  // 评分散图（用于推荐展示重点/景别等）
  const scoredImages = images
    .map((image) => ({ image, ...scoreReference(image, target) }))
    .sort((a, b) => b.score - a.score);

  const bestGroup = scoredGroups[0];
  const bestImage = scoredImages[0];

  const recommendedShot = bestGroup?.group.shotType || bestImage?.image.shotType || "全身";
  const recommendedFace = bestGroup?.group.faceVisible ?? bestImage?.image.faceVisible ?? false;
  const recommendedFocus = bestGroup?.group.displayFocus || bestImage?.image.displayFocus;

  const protection = buildGarmentProtectionModule({
    productType: project.productType,
    attributes: project.profile?.attributes,
    protectionItems: project.profile?.protectionItems,
    detailDescription: project.profile?.detailDescription,
  });

  const modules: PromptModules = {
    ...emptyPromptModules(),
    poseDescription: bestGroup?.group.tags || "自然站立，完整展示服装",
    composition: bestImage?.image.composition || "居中构图，3:4竖版，完整展示商品",
    displayFocus: recommendedFocus || brief.displayFocus || "服装整体版型与设计细节",
    personRequirement: `保持同一模特，${recommendedFace ? "允许露出脸部" : "不露脸或遮挡脸部"}`,
    garmentProtection: protection,
    forbidden: "禁止改变服装类别、版型、长度、颜色、面料材质与纹理；禁止增删细节、拼图多宫格、文字水印、畸形肢体；禁止直接返回输入图。",
  };
  const prompt = composePrompt(modules);

  const risks: string[] = [];
  if (!bestGroup) risks.push("图库中没有匹配的姿势模板组，建议手动选择参考图");
  if (bestGroup?.group.missingImages?.length) risks.push(`推荐姿势组缺少图片：${bestGroup.group.missingImages.join("、")}`);
  if (bestGroup && bestGroup.score < 50) risks.push("推荐匹配度较低，建议人工确认参考图是否合适");
  if (!recommendedFocus) risks.push("未能识别出明确的展示重点，建议人工补充");

  return {
    product: {
      productType: brief.productType,
      productSubtype: brief.productSubtype,
      displayFocus: brief.displayFocus,
      shotType: brief.shotType,
      faceVisible: brief.faceVisible,
    },
    recommendedFocus,
    recommendedShot,
    recommendedFace,
    recommendedPoseGroup: bestGroup?.group,
    poseImages: [
      bestGroup?.group.pose01Path,
      bestGroup?.group.pose02Path,
      bestGroup?.group.pose03Path,
    ],
    garmentProtection: protection,
    risks,
    prompt,
  };
}
