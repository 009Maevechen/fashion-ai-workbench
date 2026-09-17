import type { ProjectAssets } from "./db";

const MAX_ARRAY_ASSET_INDEX: Partial<Record<keyof ProjectAssets, number>> = {
  poseReferenceImages: 2,
  standaloneRecolorPoseImages: 3,
  otherMaterialImages: 4,
};

export function isValidArrayAssetIndex(
  assetKey: keyof ProjectAssets,
  index: number,
) {
  const max = MAX_ARRAY_ASSET_INDEX[assetKey];
  return max !== undefined && Number.isInteger(index) && index >= 0 && index <= max;
}
