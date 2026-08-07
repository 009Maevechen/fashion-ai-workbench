import {NextResponse} from "next/server";
import sharp from "sharp";
import {getProject} from "@/lib/db";
import {localImage} from "@/lib/ai/storage";
import {contrastTrimForHex,extractColorPalette} from "@/lib/color-palette";

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const project=await getProject((await params).id);
    if(!project)throw new Error("商品项目不存在");
    const reference=project.assets.colorReferenceCropImage||project.assets.colorReferenceImage;
    if(!reference)throw new Error("请先上传颜色参考图");
    const input=await localImage(reference),metadata=await sharp(input).metadata();
    if(!metadata.width||!metadata.height)throw new Error("颜色参考图缺少有效尺寸");
    const {data,info}=await sharp(input).resize(160,120,{fit:"fill"}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const colors=extractColorPalette(data,info.channels,5).map(color=>({...color,...contrastTrimForHex(color.hex)}));
    if(!colors.length)throw new Error("没有从参考图中识别到有效颜色，请更换清晰的产品平铺图");
    return NextResponse.json({colors,analyzedAt:new Date().toISOString()});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"颜色分析失败"},{status:400});
  }
}
