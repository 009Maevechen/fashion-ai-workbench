import {providerHealth} from "@/lib/ai/config";
import StorageManager from "@/components/StorageManager";
import ProviderSettingsManager from "@/components/ProviderSettingsManager";
import {getWorkflowModelBindings,getWorkflowRuntimeSummary,listApiProviders} from "@/lib/ai/provider-settings";

export const dynamic="force-dynamic";

export default async function Settings(){
  const health=providerHealth();
  const [apiProviders,bindings,runtime]=await Promise.all([listApiProviders(),getWorkflowModelBindings(),getWorkflowRuntimeSummary()]);
  const providers=[
    ["BFL API",health.bfl,"FLUX Virtual Try-On"],
    ["FASHN API",health.fashn,"FASHN Try-On Max"],
    ["火山方舟 API",health.volcengine,"Seedream"],
    ["FLUX.2 API",health.flux,"Klein / Pro"],
    ["自定义图像 API",health.custom,"OpenAI-compatible JSON"],
  ] as const;
  return <>
    <header className="page-head"><div><div className="eyebrow">Server configuration</div><h1>API与模型设置</h1><p>这里只显示连接状态，浏览器不会读取或返回完整 API Key。</p></div></header>
    <section className="card">
      <div className="grid">{providers.map(([name,ok,model])=><article className="image-card" key={name}><div className="panel-head"><h2>{name}</h2><span className={`badge ${ok?"success":"failed"}`}>{ok?"已配置":"未配置"}</span></div><small>{model}</small></article>)}</div>
      <div className="notice" style={{marginTop:18}}>请在服务器的 <code>.env.local</code> 或部署平台环境变量中配置，保存后重启工作台。API Key 不会进入网页或 LocalStorage。</div>
    </section>
    <ProviderSettingsManager initialProviders={apiProviders} initialBindings={bindings} initialRuntime={runtime}/>
    <StorageManager/>
  </>;
}
