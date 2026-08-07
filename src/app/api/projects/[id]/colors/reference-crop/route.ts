import {NextResponse} from "next/server";
import sharp from "sharp";
import {getProject,updateProject} from "@/lib/db";
import {localImage,saveOutput} from "@/lib/ai/storage";

type Region={x:number;y:number;width:number;height:number};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id;
    const {region}=await request.json() as {region:Region};
    const project=await getProject(id);
    if(!project?.assets.colorReferenceImage)throw new Error("请先上传颜色参考图");
    if(!region||region.width<.01||region.height<.01)throw new Error("请框选需要识别的服装区域");
    const input=await localImage(project.assets.colorReferenceImage);
    const normalized=await sharp(input).rotate().toBuffer();
    const metadata=await sharp(normalized).metadata();
    if(!metadata.width||!metadata.height)throw new Error("颜色参考图尺寸无效");
    const left=Math.max(0,Math.min(metadata.width-1,Math.round(region.x*metadata.width)));
    const top=Math.max(0,Math.min(metadata.height-1,Math.round(region.y*metadata.height)));
    const width=Math.min(metadata.width-left,Math.max(10,Math.round(region.width*metadata.width)));
    const height=Math.min(metadata.height-top,Math.max(10,Math.round(region.height*metadata.height)));
    const output=await sharp(normalized).extract({left,top,width,height}).jpeg({quality:95}).toBuffer();
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
