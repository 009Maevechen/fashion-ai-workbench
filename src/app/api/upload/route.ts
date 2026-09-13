import {NextResponse} from "next/server";
import {updateProjectWith,type ProductDetailAssetKey,type ProjectAssets} from "@/lib/db";
import {invalidateForAssetChange,persistUpload} from "@/lib/workflow";
import {moveFileToTrash} from "@/lib/ai/storage";
import {imageSourceVersions} from "@/lib/image-sources";

const KEYS=new Set<keyof ProjectAssets>(["garmentImage","productFrontImage","productBackImage","productDetailImage","printCloseupImage","buttonCloseupImage","pocketCloseupImage","necklineCloseupImage","sleeveCloseupImage","hemCloseupImage","stitchingCloseupImage","modelReferenceImage","fabricTextureImage","otherMaterialImages","standalonePoseInputImage","poseReferenceImages","colorReferenceImage","standaloneRecolorPoseImages"]);
const ARRAY_KEYS=new Set<keyof ProjectAssets>(["poseReferenceImages","standaloneRecolorPoseImages","otherMaterialImages"]);
const DETAIL_LOCK_KEYS=new Set<keyof ProjectAssets>(["garmentImage","productFrontImage","productBackImage","productDetailImage","printCloseupImage","buttonCloseupImage","pocketCloseupImage","necklineCloseupImage","sleeveCloseupImage","hemCloseupImage","stitchingCloseupImage","fabricTextureImage"]);
const PRODUCT_DETAIL_KEYS=new Set<ProductDetailAssetKey>(["productFrontImage","productBackImage","productDetailImage","printCloseupImage","buttonCloseupImage","pocketCloseupImage","necklineCloseupImage","sleeveCloseupImage","hemCloseupImage","stitchingCloseupImage","modelReferenceImage","fabricTextureImage","colorReferenceImage"]);
export async function POST(request:Request){
  try{
    const form=await request.formData(),file=form.get("file"),sku=String(form.get("sku")||""),name=String(form.get("name")||"upload"),projectId=String(form.get("projectId")||""),assetKey=String(form.get("assetKey")||"") as keyof ProjectAssets,index=Number(form.get("index")??-1);
    if(!(file instanceof File)||!sku)throw new Error("缺少图片或SKU");
    const url=await persistUpload(file,sku,name);
    if(projectId&&KEYS.has(assetKey)){
      let previous:string|undefined;
      await updateProjectWith(projectId,project=>{
        const assets={...project.assets};
        const assetImageVersions={...(project.assetImageVersions||{})};
        if(ARRAY_KEYS.has(assetKey)){const max=["standaloneRecolorPoseImages","poseReferenceImages"].includes(assetKey)?2:4;if(index<0||index>max)throw new Error("素材图片序号无效");const values=[...((assets[assetKey] as string[]|undefined)||[])];previous=values[index];values[index]=url;Object.assign(assets,{[assetKey]:values})}
        else{previous=assets[assetKey] as string|undefined;Object.assign(assets,{[assetKey]:url})}
        if(ARRAY_KEYS.has(assetKey)){const versions=[...((assetImageVersions[assetKey] as ReturnType<typeof imageSourceVersions>[]|undefined)||[])];versions[index]=imageSourceVersions(url,url);assetImageVersions[assetKey]=versions}else assetImageVersions[assetKey]=imageSourceVersions(url,url);
        const now=new Date().toISOString();
        const poseReferenceInputs=assetKey==="poseReferenceImages"
          ?Array.from({length:3},(_,poseIndex)=>({id:project.poseReferenceInputs?.[poseIndex]?.id||crypto.randomUUID(),poseIndex:(poseIndex+1) as 1|2|3,imagePath:(assets.poseReferenceImages||[])[poseIndex]||"",description:project.poseReferenceInputs?.[poseIndex]?.description,createdAt:project.poseReferenceInputs?.[poseIndex]?.createdAt||now,updatedAt:now})).filter(item=>item.imagePath)
          :project.poseReferenceInputs;
        const assetEvidence={...(project.assetEvidence||{})};
        if(PRODUCT_DETAIL_KEYS.has(assetKey as ProductDetailAssetKey))assetEvidence[assetKey as ProductDetailAssetKey]={source:"manual",sourceImage:url,confidence:1,needsReview:false,confirmed:true,reason:"用户人工上传并确认",createdAt:now,reviewedAt:now};
        return {assets,assetImageVersions,assetEvidence,poseReferenceInputs,selectedPoseTemplateGroupId:assetKey==="poseReferenceImages"?undefined:project.selectedPoseTemplateGroupId,poseTemplateSnapshot:assetKey==="poseReferenceImages"?undefined:project.poseTemplateSnapshot,...(DETAIL_LOCK_KEYS.has(assetKey)?{garmentDetailLock:undefined}:{})};
      });
      await invalidateForAssetChange(projectId,assetKey);
      if(previous&&previous!==url)await moveFileToTrash(previous,projectId);
    }
    return NextResponse.json({url,status:"saved"});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"上传失败"},{status:400})}
}
