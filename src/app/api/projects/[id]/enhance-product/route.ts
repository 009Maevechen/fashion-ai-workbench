import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {getProject,updateProject} from "@/lib/db";
import {localImage,saveOutput,moveFileToTrash,toDataUrl,downloadImage} from "@/lib/ai/storage";
import {enhanceProductDetailBuffer,prepareProviderInput,safeSegment} from "@/lib/ai/validators";
import {resolveWorkflowModel} from "@/lib/ai/provider-settings";
import {generateImage} from "@/lib/ai/generate";
import {imageSourceVersions} from "@/lib/image-sources";
import {rotatedDimensions} from "@/lib/image-limits";

const AI_ENHANCE_PROMPT =
  "无损放大这张服装产品图，显著提升清晰度、锐度、分辨率和细节解析力；严格保持商品款式、版型、颜色、面料纹理、罗纹、纽扣、口袋、条纹、拼接、印花、包边和一切设计完全不变，不得改变、增删、变形、换色或重画任何商品细节，不得添加水印或文字。输出一张高清、自然、真实、细节清晰的产品图。";

// 优先用图片模型做真正的 AI 超分增强；模型失败时回退到确定性高清放大。
async function aiEnhance(sku:string,imageUrl:string){
  const choice=await resolveWorkflowModel("recolor","quality","primary");
  const sourceBuffer=await localImage(imageUrl);
  const prepared=await prepareProviderInput(sourceBuffer);
  const generated=await generateImage({
    workflow:"recolor",
    provider:choice.type,
    model:choice.model,
    images:[toDataUrl(prepared.buffer,prepared.mime)],
    prompt:AI_ENHANCE_PROMPT,
    options:{mode:"quality",sku},
  },choice);
  const downloaded=generated.imageBase64
    ?{buffer:Buffer.from(generated.imageBase64,"base64"),mime:generated.mimeType||"image/jpeg"}
    :await downloadImage(generated.temporaryImageUrl!);
  return downloaded.buffer;
}

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id;
    const project=await getProject(id);
    if(!project)throw new Error("项目不存在");
    const source=project.assets.garmentImage;
    if(!source)throw new Error("请先上传产品主图，再一键变高清");

    const decoded=await localImage(source);
    const {width:sourceWidth,height:sourceHeight}=await rotatedDimensions(decoded);

    let detailSource:Buffer;
    let method:"ai"|"deterministic"="ai";
    let aiError:string|undefined;
    try{
      detailSource=await aiEnhance(project.sku,source);
    }catch(error){
      aiError=error instanceof Error?error.message:"未知错误";
      method="deterministic";
      const result=await enhanceProductDetailBuffer(decoded);
      detailSource=result.detailSource;
    }

    const {width:enhancedWidth,height:enhancedHeight}=await rotatedDimensions(detailSource);
    const enhancedUrl=await saveOutput(project.sku,"source/product-detail-master",`${safeSegment(project.sku)}-${crypto.randomUUID()}-detail-master.jpg`,detailSource);
    const previous=project.assets.garmentEnhancedImage;
    const now=new Date().toISOString();
    const productImageEnhancement={
      status:"enhanced" as const,
      sourceWidth,
      sourceHeight,
      enhancedWidth,
      enhancedHeight,
      blurDetected:false,
      lowResolution:Math.max(sourceWidth,sourceHeight)<1600,
      sourceSharpness:0,
      enhancedSharpness:0,
      methods:[
        method==="ai"
          ?`AI 超分增强至 ${enhancedWidth}×${enhancedHeight}px`
          :`确定性高清放大至 ${enhancedWidth}×${enhancedHeight}px（AI增强失败，已回退：${aiError}）`,
        "保持商品设计完全不变",
      ],
      processedAt:now,
    };
    const updated=await updateProject(id,{
      assets:{...project.assets,garmentEnhancedImage:enhancedUrl},
      assetImageVersions:{...(project.assetImageVersions||{}),garmentEnhancedImage:imageSourceVersions(enhancedUrl,enhancedUrl)},
      productImageEnhancement,
    });
    if(previous&&previous!==enhancedUrl)await moveFileToTrash(previous,id);
    return NextResponse.json({
      enhancedUrl,
      method,
      aiError,
      enhancedSize:{width:enhancedWidth,height:enhancedHeight},
      productImageEnhancement,
      project:updated,
    });
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"一键变高清失败"},{status:400});
  }
}
