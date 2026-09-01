import {NextResponse} from "next/server";
import {getProject,updateProject} from "@/lib/db";
import {localImage,saveOutput} from "@/lib/ai/storage";
import {safeSegment} from "@/lib/ai/validators";
import sharp from "sharp";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id;
    const {colorId,region}=await request.json() as {colorId:string;region:{x:number;y:number;width:number;height:number}};
    const project=await getProject(id);
    const reference=project?.assets.colorReferenceImage||project?.assets.garmentImage;
    if(!project||!reference)throw new Error("请先上传多颜色参考图或产品主图");
    if(region.width<0.08||region.height<0.08||region.width*region.height<0.015)throw new Error("请完整框选该颜色款的整件服装，不能只框颜色小块");
    if(region.x<0||region.y<0||region.x+region.width>1.001||region.y+region.height>1.001)throw new Error("颜色款框选区域越界，请重新框选");
    const input=await localImage(reference);
    const normalized=await sharp(input).rotate().toBuffer();
    const meta=await sharp(normalized).metadata();
    if(!meta.width||!meta.height)throw new Error("参考图尺寸无效");
    const left=Math.max(0,Math.round(region.x*meta.width));
    const top=Math.max(0,Math.round(region.y*meta.height));
    const width=Math.min(meta.width-left,Math.max(10,Math.round(region.width*meta.width)));
    const height=Math.min(meta.height-top,Math.max(10,Math.round(region.height*meta.height)));
    const out=await sharp(normalized).extract({left,top,width,height}).jpeg({quality:95}).toBuffer();
    const url=await saveOutput(project.sku,"source/colors",`${safeSegment(colorId)}-${crypto.randomUUID()}.jpg`,out);
    const colors=(project.targetColors||[]).map(color=>color.id===colorId?{...color,cropImage:url,cropRegion:region,status:"ready" as const}:color);
    await updateProject(id,{targetColors:colors});
    return NextResponse.json({url,region});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"裁剪失败"},{status:400});
  }
}
