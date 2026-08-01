import {NextResponse} from "next/server";
import sharp from "sharp";
import {getProject} from "@/lib/db";
import {localImage} from "@/lib/ai/storage";
import {extractColorPalette} from "@/lib/color-palette";

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const project=await getProject((await params).id);
    if(!project)throw new Error("商品项目不存在");
    if(!project.assets.colorReferenceImage)throw new Error("请先上传颜色参考图");
    const input=await localImage(project.assets.colorReferenceImage),metadata=await sharp(input).metadata();
    if(!metadata.width||!metadata.height)throw new Error("颜色参考图缺少有效尺寸");
    const top=Math.round(metadata.height*.12),height=Math.max(1,metadata.height-top-Math.round(metadata.height*.03));
    const {data,info}=await sharp(input).extract({left:0,top,width:metadata.width,height}).resize(160,120,{fit:"fill"}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const colors=extractColorPalette(data,info.channels,5);
    if(!colors.length)throw new Error("没有从参考图中识别到有效颜色，请更换清晰的产品平铺图");
    return NextResponse.json({colors,analyzedAt:new Date().toISOString()});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"颜色分析失败"},{status:400});
  }
}
