import {NextResponse} from "next/server";
import {updateProjectWith,type ProjectAssets} from "@/lib/db";
import {invalidateForAssetChange,persistUpload} from "@/lib/workflow";
import {moveFileToTrash} from "@/lib/ai/storage";

const KEYS=new Set<keyof ProjectAssets>(["garmentImage","productFrontImage","productBackImage","productDetailImage","printCloseupImage","buttonCloseupImage","modelReferenceImage","fabricTextureImage","otherMaterialImages","standalonePoseInputImage","poseReferenceImages","colorReferenceImage","standaloneRecolorPoseImages"]);
const ARRAY_KEYS=new Set<keyof ProjectAssets>(["poseReferenceImages","standaloneRecolorPoseImages","otherMaterialImages"]);
export async function POST(request:Request){
  try{
    const form=await request.formData(),file=form.get("file"),sku=String(form.get("sku")||""),name=String(form.get("name")||"upload"),projectId=String(form.get("projectId")||""),assetKey=String(form.get("assetKey")||"") as keyof ProjectAssets,index=Number(form.get("index")??-1);
    if(!(file instanceof File)||!sku)throw new Error("缺少图片或SKU");
    const url=await persistUpload(file,sku,name);
    if(projectId&&KEYS.has(assetKey)){
      let previous:string|undefined;
      await updateProjectWith(projectId,project=>{
        const assets={...project.assets};
        if(ARRAY_KEYS.has(assetKey)){const max=["standaloneRecolorPoseImages","poseReferenceImages"].includes(assetKey)?2:4;if(index<0||index>max)throw new Error("素材图片序号无效");const values=[...((assets[assetKey] as string[]|undefined)||[])];previous=values[index];values[index]=url;Object.assign(assets,{[assetKey]:values})}
        else{previous=assets[assetKey] as string|undefined;Object.assign(assets,{[assetKey]:url})}
        const now=new Date().toISOString();
        const poseReferenceInputs=assetKey==="poseReferenceImages"
          ?Array.from({length:3},(_,poseIndex)=>({id:project.poseReferenceInputs?.[poseIndex]?.id||crypto.randomUUID(),poseIndex:(poseIndex+1) as 1|2|3,imagePath:(assets.poseReferenceImages||[])[poseIndex]||"",description:project.poseReferenceInputs?.[poseIndex]?.description,createdAt:project.poseReferenceInputs?.[poseIndex]?.createdAt||now,updatedAt:now})).filter(item=>item.imagePath)
          :project.poseReferenceInputs;
        return {assets,poseReferenceInputs,selectedPoseTemplateGroupId:assetKey==="poseReferenceImages"?undefined:project.selectedPoseTemplateGroupId,poseTemplateSnapshot:assetKey==="poseReferenceImages"?undefined:project.poseTemplateSnapshot};
      });
      await invalidateForAssetChange(projectId,assetKey);
      if(previous&&previous!==url)await moveFileToTrash(previous,projectId);
    }
    return NextResponse.json({url,status:"saved"});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"上传失败"},{status:400})}
}
