import {NextResponse} from "next/server";
import {getProject,updateProject,type ProjectAssets} from "@/lib/db";
import {moveFileToTrash} from "@/lib/ai/storage";
import {invalidateForAssetChange} from "@/lib/workflow";

const KEYS=new Set<keyof ProjectAssets>(["garmentImage","productFrontImage","productBackImage","productDetailImage","printCloseupImage","buttonCloseupImage","brandTagImage","modelReferenceImage","fabricTextureImage","otherMaterialImages","standalonePoseInputImage","poseReferenceImages","colorReferenceImage","standaloneRecolorPoseImages"]);
const ARRAY_KEYS=new Set<keyof ProjectAssets>(["poseReferenceImages","standaloneRecolorPoseImages","otherMaterialImages"]);
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id,{assetKey,index}=await request.json() as {assetKey:keyof ProjectAssets;index?:number};
    if(!KEYS.has(assetKey))throw new Error("非法素材字段");
    const project=await getProject(id);if(!project)throw new Error("项目不存在");
    const assets={...project.assets};let url:string|undefined;
    if(ARRAY_KEYS.has(assetKey)){const values=[...((assets[assetKey] as string[]|undefined)||[])];url=values[index??-1];values[index??-1]=undefined as unknown as string;Object.assign(assets,{[assetKey]:values})}
    else{url=assets[assetKey] as string|undefined;delete assets[assetKey]}
    if(url&&!url.startsWith("/api/files/pose-library/"))await moveFileToTrash(url,id);
    const now=new Date().toISOString();
    const poseReferenceInputs=assetKey==="poseReferenceImages"
      ?Array.from({length:3},(_,poseIndex)=>({id:project.poseReferenceInputs?.[poseIndex]?.id||crypto.randomUUID(),poseIndex:(poseIndex+1) as 1|2|3,imagePath:(assets.poseReferenceImages||[])[poseIndex]||"",description:project.poseReferenceInputs?.[poseIndex]?.description,createdAt:project.poseReferenceInputs?.[poseIndex]?.createdAt||now,updatedAt:now})).filter(item=>item.imagePath)
      :project.poseReferenceInputs;
    await updateProject(id,{assets,poseReferenceInputs});await invalidateForAssetChange(id,assetKey);
    return NextResponse.json(await getProject(id));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"删除素材失败"},{status:400})}
}
