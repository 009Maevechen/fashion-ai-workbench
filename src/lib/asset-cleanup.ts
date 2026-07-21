import type {Project,ProjectAssets,TargetColor} from "./db";

export const CLEARABLE_SOURCE_KEYS=["garmentImage","productDetailImage","brandTagImage","modelReferenceImage","fabricTextureImage","otherMaterialImages","modelImage","standalonePoseInputImage","colorReferenceImage","standaloneRecolorPoseImages"] as const satisfies readonly (keyof ProjectAssets)[];

export function prepareSourceAssetCleanup(project:Project){
  const assets={...project.assets};
  const urls:string[]=[];
  for(const key of CLEARABLE_SOURCE_KEYS){const value=assets[key];if(typeof value==="string"&&value)urls.push(value);else if(Array.isArray(value))urls.push(...value.filter(Boolean));delete assets[key]}
  const targetColors=(project.targetColors||[]).map(color=>{if(color.cropImage)urls.push(color.cropImage);const next:TargetColor={...color};delete next.cropImage;delete next.cropRegion;if(!next.poseResults?.length)next.status=next.hex?"ready":"draft";return next});
  return {assets,targetColors,urls:[...new Set(urls)]};
}
export function hasClearableSourceAssets(project:Project){return prepareSourceAssetCleanup(project).urls.length>0}
