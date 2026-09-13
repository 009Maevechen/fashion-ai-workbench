import {NextResponse} from "next/server";
import JSZip from "jszip";
import {getProject} from "@/lib/db";
import {localImage} from "@/lib/ai/storage";
import {safeSegment} from "@/lib/ai/validators";
import {uniqueArchivePath} from "@/lib/archive-paths";
import {confirmedColorResults} from "@/lib/recolor-collection";

async function add(zip:JSZip,used:Set<string>,path:string,url?:string){if(!url)return false;try{zip.file(uniqueArchivePath(path,used),await localImage(url));return true}catch{return false}}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const p=await getProject((await params).id);if(!p)return NextResponse.json({error:"项目不存在"},{status:404});const colors=p.targetColors||[],query=new URL(request.url).searchParams,requestedWorkflow=query.get("workflow"),workflow=["tryon","pose","recolor"].includes(requestedWorkflow||"")?requestedWorkflow:undefined;
  const sku=safeSegment(query.get("sku")||p.sku);if(!sku)return NextResponse.json({error:"导出货号不能为空"},{status:400});const archive=new JSZip(),used=new Set<string>();let count=0;
  if(!workflow||workflow==="tryon")if(await add(archive,used,`tryon/${sku}_tryon_01.jpg`,p.confirmedTryonImage))count++;
  if(!workflow||workflow==="pose")for(const [i,u] of (p.confirmedPoseImages||[]).entries())if(await add(archive,used,`pose/${sku}_original_pose${String(i+1).padStart(2,"0")}.jpg`,u))count++;
  if(!workflow||workflow==="recolor"){for(const [colorIndex,color] of colors.entries()){const colorName=safeSegment(color.name)||`颜色${colorIndex+1}`;for(const [i,u] of confirmedColorResults(color).entries())if(await add(archive,used,`recolor/${colorName}/${sku}_${colorName}_pose${String(i+1).padStart(2,"0")}.jpg`,u))count++}const known=new Set(colors.flatMap(confirmedColorResults));for(const [i,u] of (p.confirmedRecolorImages||[]).filter(url=>!known.has(url)).entries())if(await add(archive,used,`recolor/未分类/${sku}_recolor_${String(i+1).padStart(2,"0")}.jpg`,u))count++}
  // 完整汇总目录：保留原有目录结构的同时，在货号目录下集中放置所有颜色的最终服装图片。
  if(!workflow){
    if(await add(archive,used,`${sku}/基础色/${sku}_换装.jpg`,p.confirmedTryonImage))count++;
    for(const [i,u] of (p.confirmedPoseImages||[]).entries())if(await add(archive,used,`${sku}/基础色/${sku}_姿势${String(i+1).padStart(2,"0")}.jpg`,u))count++;
    for(const [colorIndex,color] of colors.entries()){
      const colorName=safeSegment(color.name)||`颜色${colorIndex+1}`;
      for(const [i,u] of confirmedColorResults(color).entries())if(await add(archive,used,`${sku}/${colorName}/${sku}_${colorName}_姿势${String(i+1).padStart(2,"0")}.jpg`,u))count++;
    }
    const grouped=new Set(colors.flatMap(confirmedColorResults));
    for(const [i,u] of (p.confirmedRecolorImages||[]).filter(url=>!grouped.has(url)).entries())if(await add(archive,used,`${sku}/复色未分类/${sku}_复色${String(i+1).padStart(2,"0")}.jpg`,u))count++;
  }
  if(!count)return NextResponse.json({error:"当前项目还没有已确认、可下载的结果图片"},{status:409});
  const data=await archive.generateAsync({type:"arraybuffer"});return new NextResponse(data,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${sku}_${workflow||"results"}.zip"`}})
}
