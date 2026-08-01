import crypto from "node:crypto";
import {NextResponse} from "next/server";
import {z} from "zod";
import {getProject,updateProject} from "@/lib/db";
import {moveFileToTrash} from "@/lib/ai/storage";
import {invalidateForAssetChange} from "@/lib/workflow";

const reference=z.object({poseIndex:z.number().int().min(1).max(3),imagePath:z.string().startsWith("/api/files/"),description:z.string().max(500).optional()});
const schema=z.object({references:z.array(reference).length(3)});

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id,project=await getProject(id);if(!project)throw new Error("项目不存在");
    const {references}=schema.parse(await request.json()),ordered=[...references].sort((a,b)=>a.poseIndex-b.poseIndex),now=new Date().toISOString();
    const inputs=ordered.map(item=>{const previous=project.poseReferenceInputs?.find(input=>input.poseIndex===item.poseIndex);return {id:previous?.id||crypto.randomUUID(),poseIndex:item.poseIndex as 1|2|3,imagePath:item.imagePath,description:item.description,createdAt:previous?.createdAt||now,updatedAt:now}});
    const updated=await updateProject(id,{poseReferenceInputs:inputs,selectedPoseTemplateGroupId:undefined,poseTemplateSnapshot:undefined,assets:{...project.assets,poseReferenceImages:ordered.map(item=>item.imagePath)},settings:{...project.settings,pose:{...(project.settings.pose||{mode:"standard",shotType:"全身",face:false,background:true,detailRequirements:"",poseInstructions:ordered.map(item=>item.description||`姿势${item.poseIndex}`),sourceMode:project.confirmedTryonImage?"confirmed":"standalone"}),referenceMode:"upload"}}});
    await invalidateForAssetChange(id,"poseReferenceImages");return NextResponse.json(updated);
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"保存姿势参考图失败"},{status:400})}
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id,project=await getProject(id);if(!project)throw new Error("项目不存在");
    const value=new URL(request.url).searchParams.get("poseIndex"),poseIndex=value?Number(value):undefined;
    if(poseIndex!==undefined&&(!Number.isInteger(poseIndex)||poseIndex<1||poseIndex>3))throw new Error("姿势序号无效");
    const removed=poseIndex?project.poseReferenceInputs?.filter(item=>item.poseIndex===poseIndex):project.poseReferenceInputs;
    for(const item of removed||[])if(!item.imagePath.startsWith("/api/files/pose-library/"))await moveFileToTrash(item.imagePath,id);
    const inputs=poseIndex?(project.poseReferenceInputs||[]).filter(item=>item.poseIndex!==poseIndex):[],images=poseIndex?(project.assets.poseReferenceImages||[]).map((image,index)=>index===poseIndex-1?"":image):[];
    const updated=await updateProject(id,{poseReferenceInputs:inputs,selectedPoseTemplateGroupId:poseIndex?project.selectedPoseTemplateGroupId:undefined,poseTemplateSnapshot:poseIndex?project.poseTemplateSnapshot:undefined,assets:{...project.assets,poseReferenceImages:images}});
    await invalidateForAssetChange(id,"poseReferenceImages");return NextResponse.json(updated);
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"删除姿势参考图失败"},{status:400})}
}
