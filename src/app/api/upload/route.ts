import {NextResponse} from "next/server";
import {updateProjectWith,type ProductDetailAssetKey,type ProjectAssets} from "@/lib/db";
import {invalidateForAssetChange,persistProductUpload,persistUpload} from "@/lib/workflow";
import {moveFileToTrash} from "@/lib/ai/storage";
import {imageSourceVersions} from "@/lib/image-sources";
import {isValidArrayAssetIndex} from "@/lib/asset-upload-limits";

const KEYS=new Set<keyof ProjectAssets>(["garmentImage","productFrontImage","productBackImage","productDetailImage","printCloseupImage","buttonCloseupImage","pocketCloseupImage","necklineCloseupImage","sleeveCloseupImage","hemCloseupImage","stitchingCloseupImage","modelReferenceImage","fabricTextureImage","otherMaterialImages","standalonePoseInputImage","poseReferenceImages","colorReferenceImage","standaloneRecolorPoseImages"]);
const ARRAY_KEYS=new Set<keyof ProjectAssets>(["poseReferenceImages","standaloneRecolorPoseImages","otherMaterialImages"]);
const DETAIL_LOCK_KEYS=new Set<keyof ProjectAssets>(["garmentImage","productFrontImage","productBackImage","productDetailImage","printCloseupImage","buttonCloseupImage","pocketCloseupImage","necklineCloseupImage","sleeveCloseupImage","hemCloseupImage","stitchingCloseupImage","fabricTextureImage"]);
const PRODUCT_DETAIL_KEYS=new Set<ProductDetailAssetKey>(["productFrontImage","productBackImage","productDetailImage","printCloseupImage","buttonCloseupImage","pocketCloseupImage","necklineCloseupImage","sleeveCloseupImage","hemCloseupImage","stitchingCloseupImage","modelReferenceImage","fabricTextureImage","colorReferenceImage"]);
export async function POST(request:Request){
  try{
    const form=await request.formData(),file=form.get("file"),sku=String(form.get("sku")||""),name=String(form.get("name")||"upload"),projectId=String(form.get("projectId")||""),assetKey=String(form.get("assetKey")||"") as keyof ProjectAssets,index=Number(form.get("index")??-1);
    if(!(file instanceof File)||!sku)throw new Error("缺少图片或SKU");
    const productUpload=assetKey==="garmentImage"?await persistProductUpload(file,sku,name):undefined;
    const url=productUpload?.url||await persistUpload(file,sku,name);
    if(projectId&&KEYS.has(assetKey)){
      let previous:string|undefined,previousEnhanced:string|undefined;
      await updateProjectWith(projectId,project=>{
        const assets={...project.assets};
        const assetImageVersions={...(project.assetImageVersions||{})};
        if(ARRAY_KEYS.has(assetKey)){if(!isValidArrayAssetIndex(assetKey,index))throw new Error("素材图片序号无效");const values=[...((assets[assetKey] as string[]|undefined)||[])];previous=values[index];values[index]=url;Object.assign(assets,{[assetKey]:values})}
        else{previous=assets[assetKey] as string|undefined;Object.assign(assets,{[assetKey]:url});if(assetKey==="garmentImage"&&productUpload){previousEnhanced=assets.garmentEnhancedImage;assets.garmentEnhancedImage=productUpload.enhancedUrl}}
        if(ARRAY_KEYS.has(assetKey)){const versions=[...((assetImageVersions[assetKey] as ReturnType<typeof imageSourceVersions>[]|undefined)||[])];versions[index]=imageSourceVersions(url,url);assetImageVersions[assetKey]=versions}else assetImageVersions[assetKey]=imageSourceVersions(url,url);
        if(productUpload)assetImageVersions.garmentEnhancedImage=imageSourceVersions(productUpload.enhancedUrl,productUpload.enhancedUrl);
        const now=new Date().toISOString();
        const poseReferenceInputs=assetKey==="poseReferenceImages"
          ?Array.from({length:3},(_,poseIndex)=>({id:project.poseReferenceInputs?.[poseIndex]?.id||crypto.randomUUID(),poseIndex:(poseIndex+1) as 1|2|3,imagePath:(assets.poseReferenceImages||[])[poseIndex]||"",description:project.poseReferenceInputs?.[poseIndex]?.description,createdAt:project.poseReferenceInputs?.[poseIndex]?.createdAt||now,updatedAt:now})).filter(item=>item.imagePath)
          :project.poseReferenceInputs;
        const assetEvidence={...(project.assetEvidence||{})};
        if(PRODUCT_DETAIL_KEYS.has(assetKey as ProductDetailAssetKey))assetEvidence[assetKey as ProductDetailAssetKey]={source:"manual",sourceImage:url,confidence:1,needsReview:false,confirmed:true,reason:"用户人工上传并确认",createdAt:now,reviewedAt:now};
        const productImageEnhancement=productUpload?{
          status:(productUpload.enhancement.needsReview?"needs_review":productUpload.enhancement.applied?"enhanced":"preserved") as "preserved"|"enhanced"|"needs_review",
          sourceWidth:productUpload.sourceWidth,
          sourceHeight:productUpload.sourceHeight,
          enhancedWidth:productUpload.enhancedWidth,
          enhancedHeight:productUpload.enhancedHeight,
          blurDetected:productUpload.enhancement.blurDetected,
          lowResolution:productUpload.enhancement.lowResolution,
          sourceSharpness:productUpload.enhancement.sourceSharpness,
          enhancedSharpness:productUpload.enhancement.enhancedSharpness,
          methods:productUpload.enhancement.methods,
          warning:productUpload.enhancement.needsReview?"原图严重模糊，已完成忠实增强，但不可凭空恢复原图中不存在的真实细节；建议人工检查或补充细节图。":undefined,
          processedAt:now,
        }:project.productImageEnhancement;
        return {assets,assetImageVersions,assetEvidence,poseReferenceInputs,productImageEnhancement,selectedPoseTemplateGroupId:assetKey==="poseReferenceImages"?undefined:project.selectedPoseTemplateGroupId,poseTemplateSnapshot:assetKey==="poseReferenceImages"?undefined:project.poseTemplateSnapshot,...(DETAIL_LOCK_KEYS.has(assetKey)?{garmentDetailLock:undefined}:{})};
      });
      await invalidateForAssetChange(projectId,assetKey);
      if(previous&&previous!==url)await moveFileToTrash(previous,projectId);
      if(previousEnhanced&&previousEnhanced!==productUpload?.enhancedUrl)await moveFileToTrash(previousEnhanced,projectId);
    }
    return NextResponse.json({url,enhancedUrl:productUpload?.enhancedUrl,enhancedSize:productUpload?{width:productUpload.enhancedWidth,height:productUpload.enhancedHeight}:undefined,enhancement:productUpload?.enhancement,status:"saved"});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"上传失败"},{status:400})}
}
