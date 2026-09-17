import type { TargetColor } from "./db";
import type { RecolorStructureMode } from "./recolor-structure";
import {
  buildColorMap,
  isCurrentColorVariantAnalysis,
} from "./color-variant-map";
import {
  isComplexColorway,
  normalizedColorName,
  selectedRecolorMainColor,
} from "./color-sets";

export type RecolorReferenceMode = "independent" | "shared" | "selected";

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
  /** 复杂款完全没有任何图片颜色依据时禁止只凭名称猜色。 */
  requiresImageReference: boolean;
};

const unique = (values: Array<string | undefined>) => [
  ...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
];

/**
 * 一个颜色款同一时间只允许一张独立参考图参与分析和生成。
 * 其余图片保留为历史记录，不得作为补充图混入当前任务。
 */
export function activeIndependentReference(color: TargetColor | undefined) {
  const references = color?.referenceImages || [];
  if (!references.length) return undefined;
  return (
    references.find((image) => image.id === color?.primaryReferenceId) ||
    references.find((image) => image.isPrimary) ||
    references
      .slice()
      .sort((a, b) =>
        String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")),
      )[0]
  );
}

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
  const activeIndependent = activeIndependentReference(color);
  const hasIndependent = Boolean(activeIndependent);
  const images = hasIndependent
    ? [activeIndependent!.path]
    : [color?.cropImage || sharedCrop].filter((image): image is string =>
        Boolean(image),
      );

  // 旧版分析曾把白色结构底图误当成当前色款。签名未升级的旧结果不得进入生成。
  const hasCurrentAnalysis = isCurrentColorVariantAnalysis(
    color?.referenceAnalysisSignature,
  );
  const profile =
    hasIndependent && hasCurrentAnalysis ? color?.colorProfile : undefined;
  // 有新的独立参考图时，它就是当前款唯一颜色事实，旧色卡不得覆盖它。
  const selectedMain = hasIndependent
    ? undefined
    : selectedRecolorMainColor(color);
  const selectedMainName = selectedMain?.name || "";
  const selectedMainHex = selectedMain?.hex || "";
  const mainColorAuthority = selectedMain ? "selected" : "reference";
  const independentObservations = hasCurrentAnalysis
    ? unique([
        ...(color?.designOverrides || []),
        ...(profile?.designDifferences || []),
      ])
    : [];
  // 复色永远不允许参考图改款；复杂款只读取真实颜色布局。
  const structureMode: RecolorStructureMode = "same_style";
  const structureDifferences: string[] = [];
  const requiresImageReference =
    !images.length && Boolean(color && isComplexColorway(color));
  const mode: RecolorReferenceMode = hasIndependent
    ? "independent"
    : images.length
      ? "shared"
      : "selected";

  const sharedReferenceColorMap: Record<string, string> = {};
  if (!hasIndependent && images.length && !selectedMain) {
    const main = color?.hex?.trim() || color?.baseHex?.trim();
    if (main) sharedReferenceColorMap.mainBody = main.toUpperCase();
    const seen = new Map<string, number>();
    for (const region of color?.colorRegions || []) {
      const part = region.part?.trim();
      const value = region.hex?.trim().toUpperCase() || region.colorName?.trim();
      if (!part || !value) continue;
      const count = seen.get(part) || 0;
      seen.set(part, count + 1);
      sharedReferenceColorMap[count ? `${part}${count + 1}` : part] = value;
    }
  }

  return {
    mode,
    images,
    primaryImage: images[0],
    promptColorName: hasIndependent
      ? profile?.primaryColor || "以当前唯一参考图为准"
      : selectedMainName ||
        (images.length ? "当前参考图主体色" : normalizedColorName(color || { name: "" })) ||
        "",
    promptHex: hasIndependent
      ? profile?.primaryHex || ""
      : selectedMainHex || color?.hex || color?.baseHex || "",
    colorMap:
      hasIndependent && hasCurrentAnalysis
        ? buildColorMap(profile)
        : selectedMain
          ? {
              mainBody: selectedMainHex || selectedMainName,
            }
          : sharedReferenceColorMap,
    designDetails: hasIndependent
      ? independentObservations
      : color?.designDetails || [],
    materialFeatures: hasIndependent
      ? profile?.fabricAppearance || ""
      : color?.materialFeatures || "",
    structureMode,
    structureDifferences,
    structureDifferenceConfidence: 0,
    mainColorAuthority,
    requiresImageReference,
  };
}
