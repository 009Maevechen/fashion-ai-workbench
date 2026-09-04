import "server-only";
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import path from "node:path";
import {required,timeout} from "../config";
import {
  buildVolcengineRequest,
  parseVolcengineImage,
  volcengineImagesEndpoint,
  type VolcengineImageResponse,
} from "../provider-contracts";
import type {ProviderRuntimeConfig} from "../provider-settings-types";
import type {GenerateInput,ImageProvider,ProviderResult} from "../types";

const SDK_UNAVAILABLE=78;

function apiError(data:VolcengineImageResponse){
  return typeof data.error==="string"?data.error:data.error?.message||data.message||"未知错误";
}

function sdkBaseUrl(baseUrl:string){
  return baseUrl.trim().replace(/\/images\/generations\/?$/i,"").replace(/\/$/,"");
}

function localSdk(){
  const bridge=process.env.VOLCENGINE_PYTHON_BRIDGE||path.join(process.cwd(),"scripts","volcengine-seedream.py");
  if(!existsSync(bridge))return;
  const configured=process.env.VOLCENGINE_PYTHON_BIN;
  if(configured)return {python:configured,bridge};
  const virtualEnvironment=process.platform==="win32"
    ?path.join(process.cwd(),".venv","Scripts","python.exe")
    :path.join(process.cwd(),".venv","bin","python");
  if(existsSync(virtualEnvironment))return {python:virtualEnvironment,bridge};
  return {python:process.platform==="win32"?"python":"python3",bridge};
}

function sdkGenerate(
  request:ReturnType<typeof buildVolcengineRequest>,
  key:string,
  baseUrl:string,
):Promise<VolcengineImageResponse|undefined>{
  const runtime=localSdk();
  if(!runtime)return Promise.resolve(undefined);
  return new Promise((resolve,reject)=>{
    const child=spawn(runtime.python,[runtime.bridge],{
      env:{...process.env,ARK_API_KEY:key,ARK_BASE_URL:sdkBaseUrl(baseUrl)},
      stdio:["pipe","pipe","pipe"],
      windowsHide:true,
    });
    const chunks:Buffer[]=[],errors:Buffer[]=[];
    let settled=false;
    const finish=(callback:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);callback()};
    const timer=setTimeout(()=>{
      child.kill();
      finish(()=>reject(new Error("Seedream Python SDK 请求超时，请重试")));
    },timeout());
    child.stdout.on("data",chunk=>chunks.push(Buffer.from(chunk)));
    child.stderr.on("data",chunk=>errors.push(Buffer.from(chunk)));
    child.stdin.on("error",()=>{});
    child.on("error",error=>finish(()=>{
      if((error as NodeJS.ErrnoException).code==="ENOENT")resolve(undefined);
      else reject(new Error(`无法启动 Seedream Python SDK：${error.message}`));
    }));
    child.on("close",code=>finish(()=>{
      if(code===SDK_UNAVAILABLE){resolve(undefined);return}
      const output=Buffer.concat(chunks).toString("utf8").trim();
      const errorOutput=Buffer.concat(errors).toString("utf8").trim();
      if(code!==0){reject(new Error(errorOutput||`Seedream Python SDK 异常退出（${code??"未知"}）`));return}
      try{resolve(JSON.parse(output) as VolcengineImageResponse)}
      catch{reject(new Error("Seedream Python SDK 返回了无法解析的结果"))}
    }));
    child.stdin.end(JSON.stringify(request));
  });
}

async function restGenerate(
  request:ReturnType<typeof buildVolcengineRequest>,
  key:string,
  baseUrl:string,
){
  let response:Response;
  try{
    response=await fetch(volcengineImagesEndpoint(baseUrl),{
      method:"POST",
      headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify(request),
      signal:AbortSignal.timeout(timeout()),
    });
  }catch(error){
    if(error instanceof Error&&error.name==="TimeoutError")throw new Error("Seedream 图像生成请求超时，请重试");
    throw new Error(`无法连接火山方舟：${error instanceof Error?error.message:"网络错误"}`);
  }
  const data=await response.json().catch(()=>({})) as VolcengineImageResponse;
  if(!response.ok)throw new Error(`Seedream 调用失败（HTTP ${response.status}）：${apiError(data)}`);
  return data;
}

export class VolcengineProvider implements ImageProvider{
  constructor(private readonly config?:ProviderRuntimeConfig){}

  async generate(input:GenerateInput,model:string):Promise<ProviderResult>{
    const key=this.config?.apiKey||process.env.ARK_API_KEY||process.env.VOLCENGINE_API_KEY||required("ARK_API_KEY","火山方舟 API Key 未配置");
    const base=this.config?.baseUrl||process.env.VOLCENGINE_API_BASE_URL||"https://ark.cn-beijing.volces.com/api/v3";
    const request=buildVolcengineRequest(input,model);
    const data=await sdkGenerate(request,key,base)||await restGenerate(request,key,base);
    return {provider:this.config?.name||"volcengine",model,...parseVolcengineImage(data)};
  }
}
