import "server-only";
import {required,timeout} from "../config";
import type {GenerateInput,ImageProvider,ProviderResult} from "../types";

type CustomResponse={data?:Array<{url?:string;b64_json?:string}>;output?:Array<{url?:string;b64_json?:string}|string>;url?:string;image?:string;error?:{message?:string}|string;message?:string};
const errorText=(value:CustomResponse["error"])=>typeof value==="string"?value:value?.message;

/**
 * 自定义连接点采用常见的 OpenAI-compatible JSON 图像请求/响应结构。
 * 非兼容厂商必须建立独立 Provider，避免把不匹配的响应误判为成功。
 */
export class CustomProvider implements ImageProvider{
  async generate(input:GenerateInput,model:string):Promise<ProviderResult>{
    const key=required("CUSTOM_IMAGE_API_KEY","自定义图像 API 尚未配置 CUSTOM_IMAGE_API_KEY");
    const endpoint=required("CUSTOM_IMAGE_API_ENDPOINT","自定义图像 API 尚未配置 CUSTOM_IMAGE_API_ENDPOINT");
    let url:URL;
    try{url=new URL(endpoint)}catch{throw new Error("CUSTOM_IMAGE_API_ENDPOINT 不是有效网址")}
    if(url.protocol!=="https:")throw new Error("自定义图像 API 必须使用 HTTPS");
    if(url.username||url.password)throw new Error("自定义图像 API 地址不得包含账号或密码");
    const response=await fetch(url,{
      method:"POST",
      headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({model,prompt:input.prompt,image:input.images,images:input.images,n:1,response_format:"b64_json"}),
      signal:AbortSignal.timeout(timeout()),
    });
    const data=await response.json().catch(()=>({})) as CustomResponse;
    if(!response.ok)throw new Error(`自定义图像 API 调用失败（${response.status}）：${errorText(data.error)||data.message||"未知错误"}`);
    const item=data.data?.[0]||data.output?.[0];
    const temporaryImageUrl=typeof item==="string"?item:item?.url||data.url;
    const imageBase64=typeof item==="object"?item?.b64_json:data.image;
    if(!temporaryImageUrl&&!imageBase64)throw new Error("自定义图像 API 响应中没有可读取的图片，请确认接口兼容格式");
    return {provider:"custom",model,temporaryImageUrl,imageBase64,mimeType:"image/jpeg"};
  }
}
