import {NextResponse} from "next/server";
import {getProject,updateProject} from "@/lib/db";
import {localImage,saveOutput} from "@/lib/ai/storage";
import {safeSegment} from "@/lib/ai/validators";
import {rotatedDimensions,rotateAndExtract} from "@/lib/image-limits";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id;
    const {colorId,region}=await request.json() as {colorId:string;region:{x:number;y:number;width:number;height:number}};
    const project=await getProject(id);
    if(!project)throw new Error("项目不存在");
    // 优先使用该颜色款独立上传的参考图（主参考图优先），没有独立参考图才回退到 SKU 级多色参考图/产品主图。
    const color=(project.targetColors||[]).find(item=>item.id===colorId);
    const primaryRef=(color?.referenceImages||[]).find(img=>img.isPrimary)||(color?.referenceImages||[])[0];
    const reference=primaryRef?.path||project.assets.colorReferenceImage||project.assets.garmentImage;
    if(!reference)throw new Error("请先上传该颜色款的参考图或产品主图");
    if(region.width<0.08||region.height<0.08||region.width*region.height<0.015)throw new Error("请完整框选该颜色款的整件服装，不能只框颜色小块");
    if(region.x<0||region.y<0||region.x+region.width>1.001||region.y+region.height>1.001)throw new Error("颜色款框选区域越界，请重新框选");
    const input=await localImage(reference);
    const {width,height}=await rotatedDimensions(input);
    const left=Math.max(0,Math.round(region.x*width));
    const top=Math.max(0,Math.round(region.y*height));
    const cropWidth=Math.min(width-left,Math.max(10,Math.round(region.width*width)));
    const cropHeight=Math.min(height-top,Math.max(10,Math.round(region.height*height)));
    const out=await rotateAndExtract(input,{left,top,width:cropWidth,height:cropHeight},95);
    const url=await saveOutput(project.sku,"source/colors",`${safeSegment(colorId)}-${crypto.randomUUID()}.jpg`,out);
    const colors=(project.targetColors||[]).map(item=>item.id===colorId?{...item,cropImage:url,cropRegion:region,status:"ready" as const,manualReviewConfirmed:true,designNeedsReview:false}:item);
    await updateProject(id,{targetColors:colors});
    return NextResponse.json({url,region});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"裁剪失败"},{status:400});
  }
}
