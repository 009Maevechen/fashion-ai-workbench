import {NextResponse} from "next/server";
import {getProject,updateProject} from "@/lib/db";
import {localImage,saveOutput} from "@/lib/ai/storage";
import {rotatedDimensions,rotateAndExtract} from "@/lib/image-limits";

type Region={x:number;y:number;width:number;height:number};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id;
    const {region}=await request.json() as {region:Region};
    const project=await getProject(id);
    if(!project?.assets.colorReferenceImage)throw new Error("请先上传颜色参考图");
    if(!region||region.width<.01||region.height<.01)throw new Error("请框选需要识别的服装区域");
    const input=await localImage(project.assets.colorReferenceImage);
    const {width,height}=await rotatedDimensions(input);
    const left=Math.max(0,Math.min(width-1,Math.round(region.x*width)));
    const top=Math.max(0,Math.min(height-1,Math.round(region.y*height)));
    const cropWidth=Math.min(width-left,Math.max(10,Math.round(region.width*width)));
    const cropHeight=Math.min(height-top,Math.max(10,Math.round(region.height*height)));
    const output=await rotateAndExtract(input,{left,top,width:cropWidth,height:cropHeight},95);
    const url=await saveOutput(project.sku,"source",`color-reference-crop-${crypto.randomUUID()}.jpg`,output);
    await updateProject(id,{assets:{...project.assets,colorReferenceCropImage:url,colorReferenceCropRegion:region}});
    return NextResponse.json({url,region});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"保存框选区域失败"},{status:400});
  }
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id;
    const project=await getProject(id);
    if(!project)throw new Error("商品项目不存在");
    const assets={...project.assets};
    delete assets.colorReferenceCropImage;
    delete assets.colorReferenceCropRegion;
    await updateProject(id,{assets});
    return NextResponse.json({ok:true});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"清除框选区域失败"},{status:400});
  }
}
