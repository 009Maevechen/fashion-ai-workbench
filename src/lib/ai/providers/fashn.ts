import "server-only";
import {required,timeout} from "../config";
import {buildFashnRequest} from "../provider-contracts";
import type {GenerateInput,ImageProvider,ProviderResult} from "../types";
import type {ProviderRuntimeConfig} from "../provider-settings-types";

type FashnError={message?:string}|string|null;
const errorText=(error:FashnError)=>typeof error==="string"?error:error?.message||"未知错误";

export class FashnProvider implements ImageProvider{
  constructor(private readonly config?:ProviderRuntimeConfig){}
  async generate(input:GenerateInput,model:string):Promise<ProviderResult>{
    const key=this.config?.apiKey||required("FASHN_API_KEY","精细模式需要配置 FASHN_API_KEY");
    const base=(this.config?.baseUrl||process.env.FASHN_API_BASE_URL||"https://api.fashn.ai/v1").replace(/\/$/,"");
    const submitted=await fetch(`${base}/run`,{
      method:"POST",
      headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify(buildFashnRequest(input,model)),
      signal:AbortSignal.timeout(timeout()),
    });
    const job=await submitted.json().catch(()=>({})) as {id?:string;message?:string;error?:FashnError};
    if(!submitted.ok)throw new Error(`FASHN 提交失败（${submitted.status}）：${job.message||errorText(job.error||null)}`);
    if(!job.id)throw new Error("FASHN 未返回任务ID");
    const started=Date.now();
    while(Date.now()-started<timeout()){
      await new Promise(resolve=>setTimeout(resolve,2000));
      const response=await fetch(`${base}/status/${encodeURIComponent(job.id)}`,{
        headers:{Authorization:`Bearer ${key}`},
        signal:AbortSignal.timeout(timeout()),
      });
      const status=await response.json().catch(()=>({})) as {status?:string;output?:string[];error?:FashnError};
      if(!response.ok)throw new Error(`FASHN 查询失败（${response.status}）：${errorText(status.error||null)}`);
      if(["failed","canceled","time_out"].includes(status.status||""))throw new Error(`FASHN 生成失败：${errorText(status.error||null)}`);
      const url=status.output?.[0];
      if(status.status==="completed"&&url)return {provider:this.config?.name||"fashn",model,temporaryImageUrl:url};
    }
    throw new Error("FASHN 生成超时");
  }
}
