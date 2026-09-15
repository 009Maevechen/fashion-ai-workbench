import type { TargetColor } from "./db";
import type { RecolorStructureMode } from "./recolor-structure";
import {
  buildColorMap,
  isCurrentColorVariantAnalysis,
} from "./color-variant-map";
import { normalizedColorName, selectedRecolorMainColor } from "./color-sets";

export type RecolorReferenceMode = "independent" | "shared";

export type RecolorReferenceEvidence = {
  mode: RecolorReferenceMode;
  images: string[];
  primaryImage?: string;
  promptColorName: string;
  promptHex: string;
  colorMap: Record<string, string>;
  designDetails: string[];
  materialFeatures: string;
  structureMode: RecolorStructureMode;
  structureDifferences: string[];
  structureDifferenceConfidence: number;
  /** 色卡里已经选定基本色时，主体色必须由色卡控制；照片只控制局部色区。 */
  mainColorAuthority: "selected" | "reference";
};

const unique = (values: Array<string | undefined>) => [
  ...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
];

/**
 * 为某一个颜色款解析唯一的复色证据来源。
 *
 * 只要用户给该颜色款上传了独立参考图，就完全忽略 SKU 级多色参考图和旧裁图；
 * 没有独立参考图时，才回退到该颜色款从共享参考图得到的裁图。
 */
export function resolveRecolorReferenceEvidence(
  color: TargetColor | undefined,
  sharedCrop?: string,
): RecolorReferenceEvidence {
  const independent = (color?.referenceImages || [])
    .slice()
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const hasIndependent = independent.length > 0;
  const images = hasIndependent
    ? independent.map((image) => image.path)
    : [color?.cropImage || sharedCrop].filter((image): image is string =>
        Boolean(image),
      );

  // 旧版分析曾把白色结构底图误当成当前色款。签名未升级的旧结果不得进入生成。
  const hasCurrentAnalysis = isCurrentColorVariantAnalysis(
    color?.referenceAnalysisSignature,
  );
  const profile =
    hasIndependent && hasCurrentAnalysis ? color?.colorProfile : undefined;
  const selectedMain = selectedRecolorMainColor(color);
  const selectedMainName = selectedMain?.name || "";
  const selectedMainHex = selectedMain?.hex || "";
  const mainColorAuthority = selectedMain ? "selected" : "reference";
  const independentDifferences = hasCurrentAnalysis
    ? unique([
        ...(color?.designOverrides || []),
        ...(profile?.designDifferences || []),
      ])
    : [];
  const manualExplicit =
    color?.structureMode === "explicit_variant" &&
    Boolean(color.structureDifferences?.length);
  const structureMode: RecolorStructureMode = manualExplicit
    ? "explicit_variant"
    : "same_style";
  const structureDifferences = manualExplicit
    ? unique(color?.structureDifferences || [])
    : [];

  return {
    mode: hasIndependent ? "independent" : "shared",
    images,
    primaryImage: images[0],
    promptColorName:
      selectedMainName ||
      (hasIndependent && profile?.primaryColor) ||
      normalizedColorName(color || { name: "" }) ||
      "",
    promptHex:
      selectedMainHex ||
      (hasIndependent && profile?.primaryHex) ||
      color?.hex ||
      color?.baseHex ||
      "",
    colorMap:
      hasIndependent && hasCurrentAnalysis
        ? buildColorMap(profile, {
            name: selectedMainName,
            hex: selectedMainHex,
          })
        : selectedMain
          ? {
              mainBody: selectedMainHex || selectedMainName,
            }
          : {},
    designDetails: hasIndependent
      ? independentDifferences
      : color?.designDetails || [],
    materialFeatures: hasIndependent
      ? profile?.fabricAppearance || ""
      : color?.materialFeatures || "",
    structureMode,
    structureDifferences,
    structureDifferenceConfidence: manualExplicit
      ? color?.structureDifferenceConfidence || 1
      : 0,
    mainColorAuthority,
  };
}
