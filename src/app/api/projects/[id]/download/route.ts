import {NextResponse} from "next/server";
import JSZip from "jszip";
import {getProject} from "@/lib/db";
import {localImage} from "@/lib/ai/storage";
import {safeSegment} from "@/lib/ai/validators";
import {uniqueArchivePath} from "@/lib/archive-paths";

async function add(zip:JSZip,used:Set<string>,path:string,url?:string){if(url)zip.file(uniqueArchivePath(path,used),await localImage(url))}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const p=await getProject((await params).id);if(!p)return NextResponse.json({error:"项目不存在"},{status:404});
  const sku=safeSegment(p.sku),archive=new JSZip(),used=new Set<string>();let count=0;
  if(p.confirmedTryonImage){await add(archive,used,`tryon/${sku}_tryon_01.jpg`,p.confirmedTryonImage);count++}
  for(const [i,u] of (p.confirmedPoseImages||[]).entries()){await add(archive,used,`pose/${sku}_original_pose${String(i+1).padStart(2,"0")}.jpg`,u);count++}
  for(const color of (p.targetColors||[]).filter(item=>item.status==="confirmed"))for(const [i,u] of (color.poseResults||[]).entries()){await add(archive,used,`recolor/${safeSegment(color.name)}/${sku}_${safeSegment(color.name)}_pose${String(i+1).padStart(2,"0")}.jpg`,u);count++}
  if(!count)return NextResponse.json({error:"当前项目还没有已确认、可下载的结果图片"},{status:409});
  const data=await archive.generateAsync({type:"arraybuffer"});return new NextResponse(data,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${sku}_results.zip"`}})
}
