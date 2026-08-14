import "server-only";
import type {GenerateInput,ImageProvider,ProviderResult} from "../../types";
import type {ProviderRuntimeConfig} from "../../provider-settings-types";
import {sycEndpoint} from "./config";
import {readSycResponse,sycNetworkError} from "./errors";
import {parseSycImageResponse} from "./response-parser";
import {serializeSycRequest} from "./request-queue";
import {normalizeSycImageUrl} from "./image-url";

function dataUrl(value:string){
  const match=value.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
  if(!match)throw new Error("SYC 输入图片不是有效的图片 Data URL");
  return {mime:match[1],bytes:Buffer.from(match[2],"base64")};
}

export class SycImageProvider implements ImageProvider{
  constructor(private readonly config:ProviderRuntimeConfig){}
  async generate(input:GenerateInput,model:string):Promise<ProviderResult>{
    const options=this.config.syc||{stream:false,partialImages:1,returnBase64:true,codexCliCompatible:false,timeoutSeconds:600};
    const headers:HeadersInit={Authorization:`Bearer ${this.config.apiKey}`};
    let body:BodyInit,url:string;
    if(input.images.length){
      url=sycEndpoint(this.config.baseUrl,"edits");
      const form=new FormData();
      form.set("model",model);form.set("prompt",input.prompt);form.set("n","1");form.set("size","1024x1536");
      // 工作台必须直接接收图片数据。若让中转站返回 URL，某些上游会返回
      // localhost/内网临时地址，桌面端无法安全下载，也不能把该地址再交给外部服务。
      form.set("response_format","b64_json");
      form.set("stream",String(options.stream));form.set("partial_images",String(options.partialImages));
      if(options.codexCliCompatible)form.set("codexCli","true");
      input.images.forEach((image,index)=>{const part=dataUrl(image),ext=part.mime==="image/png"?"png":part.mime==="image/webp"?"webp":"jpg";form.append("image[]",new Blob([part.bytes],{type:part.mime}),`reference-${index+1}.${ext}`)});
      body=form;
    }else{
      url=sycEndpoint(this.config.baseUrl,"generations");headers["Content-Type"]="application/json";
      body=JSON.stringify({model,prompt:input.prompt,n:1,size:"1024x1536",response_format:"b64_json",stream:options.stream,partial_images:options.partialImages,...(options.codexCliCompatible?{codexCli:true}:{})});
    }
    let response:Response;
    try{response=await serializeSycRequest(()=>fetch(url,{method:"POST",headers,body,signal:AbortSignal.timeout(options.timeoutSeconds*1000)}))}catch(error){throw sycNetworkError(error)}
    const contentType=response.headers.get("content-type")||"";
    if(contentType.includes("text/event-stream"))throw new Error("SYC 当前返回流式事件；图片工作流暂不支持解析流式结果，请关闭“流式传输”");
    let payload:unknown;
    try{payload=await readSycResponse(response)}catch(error){
      if(input.images.length&&error instanceof Error&&/not support|unsupported|image edit|multipart|不支持/i.test(error.message))throw new Error(`SYC 当前图片模型不支持当前工作流的多图编辑：${error.message}`);
      throw error;
    }
    const result=parseSycImageResponse(payload);
    if(result.temporaryImageUrl)result.temporaryImageUrl=normalizeSycImageUrl(result.temporaryImageUrl,this.config.baseUrl);
    return {provider:"SYC 中转站",model,...result};
  }
}
