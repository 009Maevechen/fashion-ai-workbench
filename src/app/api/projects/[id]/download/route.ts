import {NextResponse} from "next/server";
import JSZip from "jszip";
import {getProject,listJobs} from "@/lib/db";
import {localImage} from "@/lib/ai/storage";
import {safeSegment} from "@/lib/ai/validators";
import {uniqueArchivePath} from "@/lib/archive-paths";
import {recolorColorsWithSavedJobs} from "@/lib/recolor-collection";

async function add(zip:JSZip,used:Set<string>,path:string,url?:string){if(!url)return false;try{zip.file(uniqueArchivePath(path,used),await localImage(url));return true}catch{return false}}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const p=await getProject((await params).id);if(!p)return NextResponse.json({error:"项目不存在"},{status:404});const colors=recolorColorsWithSavedJobs(p,await listJobs({projectId:p.id}));
  const sku=safeSegment(p.sku),archive=new JSZip(),used=new Set<string>();let count=0;
  if(await add(archive,used,`tryon/${sku}_tryon_01.jpg`,p.confirmedTryonImage))count++;
  for(const [i,u] of (p.confirmedPoseImages||[]).entries())if(await add(archive,used,`pose/${sku}_original_pose${String(i+1).padStart(2,"0")}.jpg`,u))count++;
  for(const [colorIndex,color] of colors.entries()){const colorName=safeSegment(color.name)||`颜色${colorIndex+1}`;for(const [i,u] of (color.poseResults||[]).entries())if(await add(archive,used,`recolor/${colorName}/${sku}_${colorName}_pose${String(i+1).padStart(2,"0")}.jpg`,u))count++}
  const known=new Set(colors.flatMap(color=>color.poseResults||[]));for(const [i,u] of (p.confirmedRecolorImages||[]).filter(url=>!known.has(url)).entries())if(await add(archive,used,`recolor/未分类/${sku}_recolor_${String(i+1).padStart(2,"0")}.jpg`,u))count++;
  if(!count)return NextResponse.json({error:"当前项目还没有已确认、可下载的结果图片"},{status:409});
  const data=await archive.generateAsync({type:"arraybuffer"});return new NextResponse(data,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${sku}_results.zip"`}})
}
