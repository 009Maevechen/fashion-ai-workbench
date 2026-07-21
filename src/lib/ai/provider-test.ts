import "server-only";
import crypto from "node:crypto";
import sharp from "sharp";
import {timeout} from "./config";
import {generateImage} from "./generate";
import {getProviderRuntime} from "./provider-settings";
import {downloadImage,saveOutput} from "./storage";
import {safeSegment,validateOutput} from "./validators";

function modelsEndpoint(baseUrl:string){const url=new URL(baseUrl);url.pathname=url.pathname.replace(/\/images\/(generations|edits)\/?$/i,"").replace(/\/$/,"")+"/models";url.search="";return url.toString()}
function connectionHeaders(type:string,key:string):HeadersInit{return type==="bfl"?{"x-key":key,Accept:"application/json"}:{Authorization:`Bearer ${key}`,Accept:"application/json"}}

export async function testProviderConnection(id:string){
  const provider=await getProviderRuntime(id),url=provider.type==="bfl"?`${provider.baseUrl.replace(/\/$/,"")}/v1/get_result?id=codex-connection-test`:provider.type==="fashn"?`${provider.baseUrl.replace(/\/$/,"")}/status/codex-connection-test`:modelsEndpoint(provider.baseUrl);
  let response:Response;
  try{response=await fetch(url,{headers:connectionHeaders(provider.type,provider.apiKey),signal:AbortSignal.timeout(Math.min(timeout(),30000))})}catch(error){if(error instanceof Error&&error.name==="TimeoutError")throw new Error("连接测试超时");throw new Error(`无法连接提供商：${error instanceof Error?error.message:"网络错误"}`)}
  if(response.status===401)throw new Error("连接失败：API Key 无效（HTTP 401）");
  if(response.status===403)throw new Error("连接失败：当前 API Key 没有访问权限（HTTP 403）");
  if(response.status>=500)throw new Error(`提供商服务异常（HTTP ${response.status}）`);
  if(provider.type!=="bfl"&&provider.type!=="fashn"&&!response.ok)throw new Error(`连接测试失败（HTTP ${response.status}），请检查 Base URL 是否包含正确的 API 版本路径`);
  return {ok:true,message:"连接测试成功",httpStatus:response.status};
}

export async function testProviderImage(id:string){
  const provider=await getProviderRuntime(id);
  if(provider.type==="bfl"||provider.type==="fashn")throw new Error(`${provider.name} 需要真实服装与模特输入图，请在服装换装页面测试图片能力`);
  const result=await generateImage({workflow:"pose",provider:provider.type,model:provider.model,images:[],prompt:"一件白色基础款服装的简洁电商产品摄影，白色背景，单张图片，无文字，无水印",options:{mode:"standard",sku:"provider-tests",seed:1}},provider);
  const downloaded=result.imageBase64?{buffer:Buffer.from(result.imageBase64,"base64"),mime:result.mimeType||"image/jpeg"}:await downloadImage(result.temporaryImageUrl!);
  await validateOutput(downloaded.buffer,downloaded.mime);
  const jpeg=await sharp(downloaded.buffer).jpeg({quality:90}).toBuffer(),filename=`test-${Date.now()}-${crypto.randomUUID()}.jpg`;
  const url=await saveOutput("provider-tests",safeSegment(provider.id),filename,jpeg);
  return {ok:true,message:"图片能力测试成功，测试结果已保存",imageUrl:url};
}
