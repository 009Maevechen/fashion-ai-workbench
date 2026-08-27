import {providerHealth} from "@/lib/ai/config";
import StorageManager from "@/components/StorageManager";
import ProviderSettingsManager from "@/components/ProviderSettingsManager";
import WorkflowModelAssignment from "@/components/WorkflowModelAssignment";
import VisualReferenceSettings from "@/components/VisualReferenceSettings";
import {getSycConfig,getWorkflowModelBindings,getWorkflowRuntimeSummary,listApiProviders} from "@/lib/ai/provider-settings";

export const dynamic="force-dynamic";

export default async function Settings(){
  const health=providerHealth();
  const [apiProviders,bindings,runtime,syc]=await Promise.all([listApiProviders(),getWorkflowModelBindings(),getWorkflowRuntimeSummary(),getSycConfig()]);
  return <>
    <header className="page-head"><div><div className="eyebrow">Server configuration</div><h1>API与模型设置</h1><p>点击提供商卡片即可查看和编辑配置；浏览器不会读取或返回完整 API Key。</p></div></header>
    <ProviderSettingsManager
      initialProviders={apiProviders}
      initialSyc={syc}
      environmentStatus={{bfl:health.bfl,fashn:health.fashn,volcengine:health.volcengine,flux:health.flux,custom:health.custom}}
    />
    <WorkflowModelAssignment
      initialBindings={bindings}
      initialRuntime={runtime}
    />
    <VisualReferenceSettings/>
    <StorageManager/>
  </>;
}
