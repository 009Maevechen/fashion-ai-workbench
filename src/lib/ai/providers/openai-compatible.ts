import "server-only";
import {timeout} from "../config";
import type {ProviderRuntimeConfig} from "../provider-settings-types";
import type {GenerateInput,ImageProvider,ProviderResult} from "../types";
import {buildOpenAiCompatibleRequest,parseOpenAiCompatibleImage,type OpenAiCompatibleResponse} from "../provider-contracts";

function apiError(data:OpenAiCompatibleResponse){return typeof data.error==="string"?data.error:data.error?.message||data.message||"未知错误"}
function endpoint(baseUrl:string){const base=baseUrl.replace(/\/$/,"");if(/\/images\/(generations|edits)$/i.test(base))return base;return `${base}/images/generations`}
function dataUrlParts(value:string){const match=value.match(/^data:([^;,]+);base64,(.+)$/);if(!match)throw new Error("输入图片不是有效 Base64 Data URL");return {mime:match[1],bytes:Buffer.from(match[2],"base64")}}

export class OpenAiCompatibleProvider implements ImageProvider{
  constructor(private readonly config:ProviderRuntimeConfig){}
  async generate(input:GenerateInput,model:string):Promise<ProviderResult>{
    const url=endpoint(this.config.baseUrl),useMultipart=/\/images\/edits$/i.test(url);
    let body:BodyInit,headers:HeadersInit={Authorization:`Bearer ${this.config.apiKey}`};
    if(useMultipart){
      if(!input.images.length)throw new Error("图片编辑接口至少需要一张输入图片");
      const form=new FormData();form.set("model",model);form.set("prompt",input.prompt);form.set("n","1");form.set("response_format","b64_json");
      input.images.forEach((image,index)=>{const part=dataUrlParts(image),extension=part.mime.includes("png")?"png":part.mime.includes("webp")?"webp":"jpg";form.append("image",new Blob([part.bytes],{type:part.mime}),`input-${index+1}.${extension}`)});body=form;
    }else{
      headers={...headers,"Content-Type":"application/json"};
      body=JSON.stringify(buildOpenAiCompatibleRequest(input,model));
    }
    let response:Response;
    try{response=await fetch(url,{method:"POST",headers,body,signal:AbortSignal.timeout(timeout())})}catch(error){if(error instanceof Error&&error.name==="TimeoutError")throw new Error("中转站请求超时");throw new Error(`无法连接中转站：${error instanceof Error?error.message:"网络错误"}`)}
    const data=await response.json().catch(()=>({})) as OpenAiCompatibleResponse;
    if(!response.ok)throw new Error(`中转站调用失败（HTTP ${response.status}）：${apiError(data)}`);
    return {provider:this.config.name,model,...parseOpenAiCompatibleImage(data)};
  }
}
