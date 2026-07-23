import {NextResponse} from "next/server";
import {getProject,updateProject,type ProjectAssets} from "@/lib/db";
import {invalidateForAssetChange,persistUpload} from "@/lib/workflow";
import {moveFileToTrash} from "@/lib/ai/storage";

const KEYS=new Set<keyof ProjectAssets>(["garmentImage","productFrontImage","productBackImage","productDetailImage","printCloseupImage","buttonCloseupImage","brandTagImage","modelReferenceImage","fabricTextureImage","otherMaterialImages","standalonePoseInputImage","colorReferenceImage","standaloneRecolorPoseImages"]);
const ARRAY_KEYS=new Set<keyof ProjectAssets>(["standaloneRecolorPoseImages","otherMaterialImages"]);
export async function POST(request:Request){
  try{
    const form=await request.formData(),file=form.get("file"),sku=String(form.get("sku")||""),name=String(form.get("name")||"upload"),projectId=String(form.get("projectId")||""),assetKey=String(form.get("assetKey")||"") as keyof ProjectAssets,index=Number(form.get("index")??-1);
    if(!(file instanceof File)||!sku)throw new Error("缺少图片或SKU");
    const url=await persistUpload(file,sku,name);
    if(projectId&&KEYS.has(assetKey)){
      const project=await getProject(projectId);if(!project)throw new Error("项目不存在");
      const assets={...project.assets};let previous:string|undefined;
      if(ARRAY_KEYS.has(assetKey)){const max=assetKey==="standaloneRecolorPoseImages"?2:4;if(index<0||index>max)throw new Error("素材图片序号无效");const values=[...((assets[assetKey] as string[]|undefined)||[])];previous=values[index];values[index]=url;Object.assign(assets,{[assetKey]:values})}
      else{previous=assets[assetKey] as string|undefined;Object.assign(assets,{[assetKey]:url})}
      await updateProject(projectId,{assets});
      await invalidateForAssetChange(projectId,assetKey);
      if(previous&&previous!==url)await moveFileToTrash(previous,projectId);
    }
    return NextResponse.json({url,status:"saved"});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"上传失败"},{status:400})}
}
