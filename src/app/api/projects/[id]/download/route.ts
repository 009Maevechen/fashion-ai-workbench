import {NextResponse} from "next/server";
import JSZip from "jszip";
import {getProject} from "@/lib/db";
import {localImage} from "@/lib/ai/storage";
import {safeSegment} from "@/lib/ai/validators";

async function add(zip:JSZip,path:string,url?:string){if(url)zip.file(path,await localImage(url))}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const p=await getProject((await params).id);if(!p)return NextResponse.json({error:"项目不存在"},{status:404});
  const sku=safeSegment(p.sku),archive=new JSZip();
  await add(archive,`tryon/${sku}_tryon_01.jpg`,p.confirmedTryonImage);
  for(const [i,u] of (p.confirmedPoseImages||[]).entries())await add(archive,`pose/${sku}_original_pose${String(i+1).padStart(2,"0")}.jpg`,u);
  for(const color of p.targetColors||[])for(const [i,u] of (color.poseResults||[]).entries())await add(archive,`recolor/${safeSegment(color.name)}/${sku}_${safeSegment(color.name)}_pose${String(i+1).padStart(2,"0")}.jpg`,u);
  const data=await archive.generateAsync({type:"arraybuffer"});return new NextResponse(data,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${sku}_results.zip"`}})
}
