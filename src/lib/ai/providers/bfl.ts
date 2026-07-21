import "server-only";
import {required,timeout} from "../config";
import {buildBflRequest} from "../provider-contracts";
import type {GenerateInput,ImageProvider,ProviderResult} from "../types";
import type {ProviderRuntimeConfig} from "../provider-settings-types";

export class BflProvider implements ImageProvider{
  constructor(private readonly config?:ProviderRuntimeConfig){}
  async generate(input:GenerateInput,model:string):Promise<ProviderResult>{
    const key=this.config?.apiKey||required("BFL_API_KEY","BFL_API_KEY 未配置，无法调用真实换装");
    const base=(this.config?.baseUrl||process.env.BFL_API_BASE_URL||"https://api.bfl.ai").replace(/\/$/,"");
    const endpoint=process.env.BFL_VTO_ENDPOINT||"/v1/flux-tools/vto-v1";
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout());
    try{
      const submit=await fetch(`${base}${endpoint.startsWith("/")?endpoint:`/${endpoint}`}`,{
        method:"POST",
        headers:{"Content-Type":"application/json","x-key":key},
        body:JSON.stringify(buildBflRequest(input)),
        signal:controller.signal,
      });
      const task=await submit.json().catch(()=>({})) as {id?:string;task_id?:string;polling_url?:string;pollingUrl?:string;result?:{polling_url?:string};detail?:string;message?:string};
      if(!submit.ok)throw new Error(`BFL 提交失败（${submit.status}）：${task.detail||task.message||"未知错误"}`);
      const id=task.id||task.task_id;
      const pollUrl=task.polling_url||task.pollingUrl||task.result?.polling_url||
        (id?`${base}/v1/get_result?id=${encodeURIComponent(id)}`:undefined);
      if(!pollUrl)throw new Error("BFL 未返回任务ID或轮询地址");
      for(;;){
        await new Promise(resolve=>setTimeout(resolve,1800));
        const response=await fetch(pollUrl,{headers:{"x-key":key},signal:controller.signal});
        const result=await response.json().catch(()=>({})) as {status?:string;error?:string;detail?:string;message?:string;result?:{sample?:string;url?:string};output?:{url?:string};url?:string};
        if(!response.ok)throw new Error(`BFL 轮询失败（${response.status}）：${result.detail||result.message||"未知错误"}`);
        const status=String(result.status||"").toLowerCase();
        if(["error","failed","request moderated","content moderated","task not found"].includes(status)){
          throw new Error(`BFL 生成失败：${result.error||result.detail||result.message||status}`);
        }
        const image=result.result?.sample||result.result?.url||result.output?.url||result.url;
        if(status==="ready"&&image)return {provider:this.config?.name||"bfl",model,temporaryImageUrl:image};
      }
    }catch(error){
      if(controller.signal.aborted)throw new Error("BFL 生成超时");
      throw error;
    }finally{
      clearTimeout(timer);
    }
  }
}
