import type {Project,ProjectAssets,TargetColor} from "./db";

export const CLEARABLE_SOURCE_KEYS=["garmentImage","garmentCropImage","productFrontImage","productBackImage","productDetailImage","printCloseupImage","buttonCloseupImage","modelReferenceImage","fabricTextureImage","otherMaterialImages","modelImage","standalonePoseInputImage","poseReferenceImages","colorReferenceImage","standaloneRecolorPoseImages"] as const satisfies readonly (keyof ProjectAssets)[];

export function prepareSourceAssetCleanup(project:Project){
  const assets={...project.assets};
  const urls:string[]=[];
  let clearedAssetCount=0;
  for(const key of CLEARABLE_SOURCE_KEYS){const value=assets[key];if(typeof value==="string"&&value){clearedAssetCount+=1;urls.push(value)}else if(Array.isArray(value)){clearedAssetCount+=value.filter(Boolean).length;urls.push(...value.filter(Boolean).filter(url=>!url.startsWith("/api/files/pose-library/")))}delete assets[key]}
  const targetColors=(project.targetColors||[]).map(color=>{if(color.cropImage)urls.push(color.cropImage);const next:TargetColor={...color};delete next.cropImage;delete next.cropRegion;if(!next.poseResults?.length)next.status=next.hex?"ready":"draft";return next});
  return {assets,targetColors,urls:[...new Set(urls)],clearedAssetCount};
}
export function hasClearableSourceAssets(project:Project){const cleanup=prepareSourceAssetCleanup(project);return cleanup.clearedAssetCount>0||(project.targetColors||[]).some(color=>Boolean(color.cropImage))}
