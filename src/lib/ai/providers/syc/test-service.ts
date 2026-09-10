import "server-only";
import crypto from "node:crypto";
import sharp from "sharp";
import {generateImage} from "../../generate";
import {getSycRuntime,getSycVisionRuntime} from "../../provider-settings";
import {downloadImage,saveOutput} from "../../storage";
import {validateOutput} from "../../validators";
import {fetchSycModels} from "./client";
import {testVisionRuntime} from "../../vision-test";

type Draft={baseUrl?:string;apiKey?:string;imageModel?:string;visionModel?:string};

export async function listSycModels(draft?:Draft){
  const runtime=await getSycRuntime(draft);
  return fetchSycModels(runtime);
}
export async function testSycConnection(draft?:Draft){
  const result=await listSycModels(draft);
  return {ok:true,message:"基础连接成功",...result};
}

export async function testSycImage(draft?:Draft){
  const runtime=await getSycRuntime(draft);
  const result=await generateImage({
    workflow:"pose",provider:"syc-openai-compatible",model:runtime.model,images:[],
    prompt:"一件纯白色基础款短袖上衣的专业电商产品摄影，浅灰纯色背景，居中，单张图片，无人物，无文字，无水印。",
    options:{mode:"standard",sku:"api-test",seed:1},
  },runtime);
  const downloaded=result.imageBase64?{buffer:Buffer.from(result.imageBase64,"base64"),mime:result.mimeType||"image/png"}:await downloadImage(result.temporaryImageUrl!);
  await validateOutput(downloaded.buffer,downloaded.mime);
  const metadata=await sharp(downloaded.buffer).metadata();
  const extension=metadata.format==="png"?"png":"jpg";
  const output=extension==="png"?await sharp(downloaded.buffer).png().toBuffer():await sharp(downloaded.buffer).jpeg({quality:92}).toBuffer();
  const imageUrl=await saveOutput("api-test","syc",`syc-test-${Date.now()}-${crypto.randomUUID()}.${extension}`,output);
  return {ok:true,message:"真实图片测试成功，结果已保存",imageUrl,mimeType:`image/${extension==="jpg"?"jpeg":"png"}`,width:metadata.width,height:metadata.height};
}

export async function testSycVision(draft?:Draft){
  return testVisionRuntime(await getSycVisionRuntime(draft));
}
