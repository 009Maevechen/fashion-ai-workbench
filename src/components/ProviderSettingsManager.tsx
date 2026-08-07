"use client";

import {useMemo,useState} from "react";
import type {ApiProviderPublic,ApiProviderType,SycConfigPublic,WorkflowModelBindings,WorkflowRuntimeSummary} from "@/lib/ai/provider-settings-types";
import type {WorkflowType} from "@/lib/ai/types";
import SycSettingsDialog from "./SycSettingsDialog";

type FormState={name:string;type:ApiProviderType;baseUrl:string;apiKey:string;defaultModel:string;enabled:boolean;notes:string};
type EnvironmentStatus={bfl:boolean;fashn:boolean;volcengine:boolean;flux:boolean;custom:boolean};
type CatalogItem={
  id:keyof EnvironmentStatus|"generic";
  label:string;
  types:ApiProviderType[];
  newType:ApiProviderType;
  model:string;
  defaultModel:string;
  baseUrl:string;
  description:string;
};
type DialogType="provider"|"syc"|"workflow"|null;

const emptyForm:FormState={name:"",type:"openai-compatible",baseUrl:"",apiKey:"",defaultModel:"",enabled:true,notes:""};
const TYPE_LABEL:Record<ApiProviderType,string>={"openai-compatible":"OpenAI兼容中转站","syc-openai-compatible":"SYC 中转站",fashn:"FASHN",bfl:"BFL / FLUX",volcengine:"火山方舟",flux:"FLUX兼容接口",custom:"自定义兼容接口"};
const PROVIDER_FORM_META:Record<Exclude<ApiProviderType,"syc-openai-compatible">,{baseUrlLabel:string;baseUrlPlaceholder:string;keyLabel:string;keyPlaceholder:string;modelLabel:string;modelPlaceholder:string;defaultBaseUrl:string;defaultModel:string;help:string}>={
  "openai-compatible":{baseUrlLabel:"API 根地址或图片编辑端点",baseUrlPlaceholder:"https://api.example.com/v1 或 …/v1/images/edits",keyLabel:"API Key / 访问令牌",keyPlaceholder:"sk-… 或平台签发的访问令牌",modelLabel:"图片模型 ID",modelPlaceholder:"例如：gpt-image-1.5",defaultBaseUrl:"https://api.openai.com/v1",defaultModel:"gpt-image-1.5",help:"适合 OpenAI 官方及兼容中转站。多图换装、姿势和复色建议填写支持图片编辑的根地址，或完整 /images/edits 端点。"},
  volcengine:{baseUrlLabel:"方舟 API Base URL",baseUrlPlaceholder:"https://ark.cn-beijing.volces.com/api/v3",keyLabel:"方舟 API Key",keyPlaceholder:"在火山方舟控制台创建的 API Key",modelLabel:"模型 ID / 推理接入点 ID",modelPlaceholder:"doubao-seedream-… 或 ep-…",defaultBaseUrl:"https://ark.cn-beijing.volces.com/api/v3",defaultModel:"doubao-seedream-5-0-260128",help:"适合火山方舟 Seedream。模型栏既可填写公开模型 ID，也可填写控制台创建的推理接入点 ID（ep-…）。"},
  bfl:{baseUrlLabel:"BFL API Base URL",baseUrlPlaceholder:"https://api.bfl.ai",keyLabel:"BFL API Key（x-key）",keyPlaceholder:"BFL 控制台签发的 API Key",modelLabel:"能力名称",modelPlaceholder:"FLUX Virtual Try-On",defaultBaseUrl:"https://api.bfl.ai",defaultModel:"FLUX Virtual Try-On",help:"适合 BFL FLUX Virtual Try-On。这里只填写 API 根地址，工作台会自动调用换装提交与结果查询接口。"},
  fashn:{baseUrlLabel:"FASHN API Base URL",baseUrlPlaceholder:"https://api.fashn.ai/v1",keyLabel:"FASHN API Key",keyPlaceholder:"FASHN 控制台签发的 API Key",modelLabel:"model_name",modelPlaceholder:"tryon-max",defaultBaseUrl:"https://api.fashn.ai/v1",defaultModel:"tryon-max",help:"适合 FASHN 虚拟试衣。工作台会使用 /run 提交任务并通过 /status 查询结果。"},
  flux:{baseUrlLabel:"FLUX 兼容 API 根地址",baseUrlPlaceholder:"https://你的服务域名/v1",keyLabel:"API Key / Bearer Token",keyPlaceholder:"服务商签发的访问令牌",modelLabel:"FLUX 模型 ID",modelPlaceholder:"填写服务商提供的模型名称",defaultBaseUrl:"",defaultModel:"",help:"适合提供 OpenAI 风格 /images/generations 的 FLUX 服务。Base URL 填到版本根路径，不要重复填写端点。"},
  custom:{baseUrlLabel:"自定义图片 API 根地址或完整端点",baseUrlPlaceholder:"https://你的服务域名/v1",keyLabel:"API Key / 访问令牌",keyPlaceholder:"服务商要求的 Bearer Token",modelLabel:"模型名称 / 接入点 ID",modelPlaceholder:"填写服务商文档中的 model 值",defaultBaseUrl:"",defaultModel:"",help:"当前自定义接口按 OpenAI 兼容格式调用；如果服务商的请求字段或鉴权方式不是 Bearer Token，请选择其专用提供商类型。"},
};
const WORKFLOWS:{key:WorkflowType;label:string;description:string}[]=[{key:"tryon",label:"服装换装",description:"服装图＋模特图生成换装候选"},{key:"pose",label:"三种姿势",description:"三次独立图片编辑任务"},{key:"recolor",label:"服装复色",description:"三张姿势图分别精准复色"}];
const CATALOG:CatalogItem[]=[
  {id:"bfl",label:"BFL API",types:["bfl"],newType:"bfl",model:"FLUX Virtual Try-On",defaultModel:"FLUX Virtual Try-On",baseUrl:"https://api.bfl.ai",description:"用于快速和标准服装换装"},
  {id:"fashn",label:"FASHN API",types:["fashn"],newType:"fashn",model:"FASHN Try-On Max",defaultModel:"tryon-max",baseUrl:"https://api.fashn.ai/v1",description:"用于精细服装换装"},
  {id:"volcengine",label:"火山方舟 API",types:["volcengine"],newType:"volcengine",model:"Seedream",defaultModel:"doubao-seedream-5-0-260128",baseUrl:"https://ark.cn-beijing.volces.com/api/v3",description:"用于姿势生成和服装复色"},
  {id:"flux",label:"FLUX.2 API",types:["flux"],newType:"flux",model:"Klein / Pro",defaultModel:"",baseUrl:"",description:"用于快速姿势和高质量编辑"},
  {id:"custom",label:"SYC 中转站 API",types:["syc-openai-compatible"],newType:"syc-openai-compatible",model:"gpt-image-2",defaultModel:"gpt-image-2",baseUrl:"https://sycagent.top/v1",description:"OpenAI 兼容图片生成与图片编辑"},
];
const GENERIC_CATALOG:CatalogItem={id:"generic",label:"自定义 API 提供商",types:["openai-compatible","custom"],newType:"openai-compatible",model:"自定义图片模型",defaultModel:"",baseUrl:"",description:"添加任意 OpenAI 兼容中转站或自定义图片接口"};
const ALL_CATALOG=[...CATALOG,GENERIC_CATALOG];

async function requestJson(url:string,init?:RequestInit){const response=await fetch(url,{...init,headers:{"Content-Type":"application/json",...(init?.headers||{})}});const data=response.status===204?null:await response.json();if(!response.ok)throw new Error(data?.error||"操作失败");return data}

export default function ProviderSettingsManager({initialProviders,initialBindings,initialRuntime,initialSyc,environmentStatus}:{initialProviders:ApiProviderPublic[];initialBindings:WorkflowModelBindings;initialRuntime:WorkflowRuntimeSummary;initialSyc:SycConfigPublic;environmentStatus:EnvironmentStatus}){
  const [providers,setProviders]=useState(initialProviders),[bindings,setBindings]=useState(initialBindings),[runtime,setRuntime]=useState(initialRuntime),[syc,setSyc]=useState(initialSyc),[form,setForm]=useState<FormState>(emptyForm),[editingId,setEditingId]=useState<string>(),[activeCatalogId,setActiveCatalogId]=useState<CatalogItem["id"]>("custom"),[dialog,setDialog]=useState<DialogType>(null),[busy,setBusy]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState(""),[testImage,setTestImage]=useState("");
  const enabledProviders=useMemo(()=>providers.filter(provider=>provider.enabled),[providers]);
  const activeCatalog=ALL_CATALOG.find(item=>item.id===activeCatalogId)||GENERIC_CATALOG;
  const catalogProviders=providers.filter(provider=>activeCatalog.types.includes(provider.type));
  const editingProvider=providers.find(provider=>provider.id===editingId);
  const activeEnvironmentConfigured=activeCatalog.id==="generic"?false:environmentStatus[activeCatalog.id];
  const environmentConfigured=(id:CatalogItem["id"])=>id==="generic"?false:environmentStatus[id];

  function clearFeedback(){setMessage("");setError("")}
  function formForCatalog(item:CatalogItem):FormState{return {name:item.label,type:item.newType,baseUrl:item.baseUrl,apiKey:"",defaultModel:item.defaultModel,enabled:true,notes:""}}
  function changeProviderType(type:Exclude<ApiProviderType,"syc-openai-compatible">){const previous=PROVIDER_FORM_META[form.type as Exclude<ApiProviderType,"syc-openai-compatible">],next=PROVIDER_FORM_META[type];setForm(current=>({...current,type,baseUrl:!current.baseUrl||current.baseUrl===previous?.defaultBaseUrl?next.defaultBaseUrl:current.baseUrl,defaultModel:!current.defaultModel||current.defaultModel===previous?.defaultModel?next.defaultModel:current.defaultModel}))}
  function startNew(item=activeCatalog){setEditingId(undefined);setForm(formForCatalog(item));clearFeedback()}
  function edit(provider:ApiProviderPublic){setEditingId(provider.id);setForm({name:provider.name,type:provider.type,baseUrl:provider.baseUrl,apiKey:"",defaultModel:provider.defaultModel,enabled:provider.enabled,notes:provider.notes||""});setTestImage("");clearFeedback()}
  function openProvider(item:CatalogItem){
    setActiveCatalogId(item.id);
    if(item.id==="custom"){clearFeedback();setDialog("syc");return}
    const first=providers.find(provider=>item.types.includes(provider.type));
    if(first)edit(first);else startNew(item);
    setDialog("provider");
  }
  function openGeneric(createNew=false){
    setActiveCatalogId("generic");
    const first=providers.find(provider=>GENERIC_CATALOG.types.includes(provider.type));
    if(first&&!createNew)edit(first);else startNew(GENERIC_CATALOG);
    setDialog("provider");
  }
  function closeDialog(){if(busy)return;setDialog(null);clearFeedback()}
  async function reload(){const [providerData,bindingData,sycData]=await Promise.all([requestJson("/api/settings/providers"),requestJson("/api/settings/workflow-models"),requestJson("/api/settings/syc")]);setProviders(providerData);setBindings(bindingData.bindings);setRuntime(bindingData.runtime);setSyc(sycData);return providerData as ApiProviderPublic[]}
  async function submit(){
    const wasEditing=Boolean(editingId);
    setBusy("save");clearFeedback();
    try{
      const body={...form,...(editingId&&!form.apiKey?{apiKey:undefined}:{})};
      await requestJson(editingId?`/api/settings/providers/${editingId}`:"/api/settings/providers",{method:editingId?"PUT":"POST",body:JSON.stringify(body)});
      await reload();
      setDialog(null);
      setEditingId(undefined);
      setForm(emptyForm);
      setMessage(wasEditing?"API配置已更新":"API配置已新增");
    }catch(e){setError(e instanceof Error?e.message:"保存失败")}finally{setBusy("")}
  }
  async function remove(provider:ApiProviderPublic){
    if(!confirm(`确认删除“${provider.name}”？相关工作流绑定会同时清除。`))return;
    setBusy(provider.id);clearFeedback();
    try{await requestJson(`/api/settings/providers/${provider.id}`,{method:"DELETE"});await reload();setDialog(null);setEditingId(undefined);setMessage("API配置已删除")}catch(e){setError(e instanceof Error?e.message:"删除失败")}finally{setBusy("")}
  }
  async function test(provider:ApiProviderPublic,mode:"connection"|"image"){
    if(mode==="image"&&!confirm(`图片能力测试会真实调用“${provider.name}”并可能产生费用，确认继续？`))return;
    setBusy(`${provider.id}:${mode}`);clearFeedback();
    try{const data=await requestJson(`/api/settings/providers/${provider.id}/test`,{method:"POST",body:JSON.stringify({mode})});const next=await reload();const refreshed=next.find(item=>item.id===provider.id);if(refreshed){setEditingId(refreshed.id);setForm({name:refreshed.name,type:refreshed.type,baseUrl:refreshed.baseUrl,apiKey:"",defaultModel:refreshed.defaultModel,enabled:refreshed.enabled,notes:refreshed.notes||""})}if(data.imageUrl)setTestImage(data.imageUrl);setMessage(data.message)}catch(e){await reload();setError(e instanceof Error?e.message:"测试失败")}finally{setBusy("")}
  }
  function updateSelection(workflow:WorkflowType,slot:"primary"|"fallback",providerId:string){const provider=providers.find(item=>item.id===providerId);setBindings(current=>({...current,[workflow]:{...current[workflow],[slot]:provider?{providerId:provider.id,model:provider.defaultModel}:undefined}}))}
  function updateModel(workflow:WorkflowType,slot:"primary"|"fallback",model:string){setBindings(current=>{const selection=current[workflow][slot];return selection?{...current,[workflow]:{...current[workflow],[slot]:{...selection,model}}}:current})}
  function environmentOptionLabel(summary:WorkflowRuntimeSummary[WorkflowType]["primary"]){
    return summary.configured?`使用现有环境变量配置 · ${summary.providerName} / ${summary.model}`:"使用现有环境变量配置";
  }
  function providerOptionLabel(provider:ApiProviderPublic){return `${provider.name} · ${provider.defaultModel||TYPE_LABEL[provider.type]}`}
  async function saveBindings(){setBusy("bindings");clearFeedback();try{const data=await requestJson("/api/settings/workflow-models",{method:"PUT",body:JSON.stringify(bindings)});setBindings(data.bindings);setRuntime(data.runtime);setDialog(null);setMessage("三个工作流的主模型与备用模型已保存")}catch(e){setError(e instanceof Error?e.message:"模型绑定保存失败")}finally{setBusy("")}}

  return <div className="settings-stack">
    {(error||message)&&!dialog&&<div className={error?"error":"notice"}>{error||message}</div>}
    <section className="card settings-hub">
      <div className="panel-head"><div><h2>API提供商</h2><small>点击卡片查看、添加或修改里面的配置</small></div><div className="panel-actions"><button className="primary" onClick={()=>openGeneric(true)}>＋ 新增 API</button></div></div>
      <div className="settings-provider-grid">
        {CATALOG.map(item=>{
          const saved=providers.filter(provider=>item.types.includes(provider.type));
          const configured=item.id==="custom"?syc.apiKeyConfigured:environmentConfigured(item.id)||saved.some(provider=>provider.enabled&&provider.hasApiKey);
          const failed=saved.some(provider=>provider.lastTestStatus==="failed");
          const sycLabel=!syc.apiKeyConfigured?"未配置":!syc.imageModel?"配置不完整":syc.lastImageTestStatus==="success"?"可用":syc.lastTestStatus==="failed"||syc.lastImageTestStatus==="failed"?"测试失败":syc.lastTestStatus==="success"?"基础连接成功":"已配置";
          const cardFailed=item.id==="custom"?sycLabel==="测试失败":failed;
          return <button type="button" className="settings-provider-tile" key={item.id} onClick={()=>openProvider(item)}>
            <span className="settings-provider-tile-head"><b>{item.label}</b><span className={`badge ${cardFailed?"failed":configured?"success":"failed"}`}>{item.id==="custom"?sycLabel:configured?"已配置":"未配置"}</span></span>
            <strong>{item.id==="custom"?syc.imageModel:item.model}</strong>
            <small>{item.description}</small>
            <span className="settings-provider-tile-foot"><span>{item.id==="custom"?(syc.lastImageTestAt||syc.lastTestAt?`最近测试 ${new Date(syc.lastImageTestAt||syc.lastTestAt!).toLocaleDateString("zh-CN")}`:"点击开始配置"):saved.length?`${saved.length} 个页面配置`:environmentConfigured(item.id)?"环境变量配置":"点击开始配置"}</span><span className={cardFailed?"danger-text":""}>{cardFailed?(syc.lastImageTestError||syc.lastError||"测试失败").slice(0,22):"查看配置 →"}</span></span>
          </button>
        })}
        <button type="button" className="settings-provider-tile" onClick={()=>openGeneric(false)}>
          <span className="settings-provider-tile-head"><b>自定义 API</b><span className={`badge ${providers.some(provider=>GENERIC_CATALOG.types.includes(provider.type)&&provider.enabled&&provider.hasApiKey)?"success":""}`}>{providers.filter(provider=>GENERIC_CATALOG.types.includes(provider.type)).length} 个配置</span></span>
          <strong>添加任意图片模型</strong>
          <small>填写 Base URL、API Key 和模型名称，支持多个配置</small>
          <span className="settings-provider-tile-foot"><span>OpenAI 兼容 / 自定义接口</span><span>管理配置 →</span></span>
        </button>
        <button type="button" className="settings-provider-tile workflow-entry-tile" onClick={()=>{clearFeedback();setDialog("workflow")}}>
          <span className="settings-provider-tile-head"><b>工作流模型分配</b><span className="badge">3 个流程</span></span>
          <strong>主模型＋备用模型</strong>
          <small>分别为换装、三种姿势和复色选择模型</small>
          <span className="settings-provider-tile-foot"><span>手动备用模型重试</span><span>查看配置 →</span></span>
        </button>
      </div>
      <div className="notice settings-security-note">API Key 只发送到本机服务器并加密保存，页面仅显示掩码，不会写入 LocalStorage。环境变量配置仍可在 <code>.env.local</code> 中使用。</div>
    </section>

    {dialog==="syc"&&<SycSettingsDialog config={syc} onClose={closeDialog} onChanged={async()=>{await reload()}}/>}

    {dialog==="provider"&&<div className="settings-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)closeDialog()}}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label={`${activeCatalog.label}配置`}>
        <header className="settings-dialog-head"><div><small>API PROVIDER</small><h2>{activeCatalog.label}</h2><p>{activeCatalog.description}</p></div><button className="settings-dialog-close" aria-label="关闭配置" onClick={closeDialog}>×</button></header>
        <div className="settings-dialog-status">
          {activeCatalog.id!=="generic"&&<span className={`badge ${activeEnvironmentConfigured?"success":"failed"}`}>环境变量：{activeEnvironmentConfigured?"已配置":"未配置"}</span>}
          <span className="badge">{catalogProviders.length} 个页面配置</span>
          <span>{activeCatalog.model}</span>
        </div>
        {catalogProviders.length>0&&<div className="settings-config-tabs">{catalogProviders.map(provider=><button type="button" className={editingId===provider.id?"active":""} key={provider.id} onClick={()=>edit(provider)}><b>{provider.name}</b><small>{provider.enabled?"已启用":"已停用"} · {provider.lastTestStatus==="success"?"测试成功":provider.lastTestStatus==="failed"?"测试失败":"未测试"}</small></button>)}<button type="button" className={!editingId?"active add":""} onClick={()=>startNew(activeCatalog)}>＋ 新增配置</button></div>}
        <div className="settings-dialog-body">
          {(error||message)&&<div className={error?"error":"notice"}>{error||message}</div>}
          <div className="settings-form-heading"><div><h3>{editingId?"编辑页面配置":"新增页面配置"}</h3><small>{editingProvider?.apiKeyMasked||"完整 API Key 不会返回网页"}</small></div>{!catalogProviders.length&&activeEnvironmentConfigured&&<span className="badge success">现有环境配置可继续使用</span>}</div>
          <div className="provider-form form-grid">
            <label className="field">配置名称<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="例如：我的中转站1"/></label>
            <label className="field">提供商类型<select value={form.type} onChange={e=>changeProviderType(e.target.value as Exclude<ApiProviderType,"syc-openai-compatible">)}>{Object.entries(TYPE_LABEL).filter(([value])=>value!=="syc-openai-compatible").map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
            {(()=>{const meta=PROVIDER_FORM_META[form.type as Exclude<ApiProviderType,"syc-openai-compatible">]||PROVIDER_FORM_META.custom;return <><div className="provider-form-guide full"><b>{TYPE_LABEL[form.type]}</b><span>{meta.help}</span></div><label className="field full">{meta.baseUrlLabel}<input value={form.baseUrl} onChange={e=>setForm({...form,baseUrl:e.target.value})} placeholder={meta.baseUrlPlaceholder}/></label><label className="field">{meta.keyLabel}<input type="password" autoComplete="new-password" value={form.apiKey} onChange={e=>setForm({...form,apiKey:e.target.value})} placeholder={editingId?"留空表示不修改":meta.keyPlaceholder}/></label><label className="field">{meta.modelLabel}<input value={form.defaultModel} onChange={e=>setForm({...form,defaultModel:e.target.value})} placeholder={meta.modelPlaceholder}/></label></>})()}
            <label className="field full">备注<textarea maxLength={500} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="可选：用途、额度或模型说明"/></label>
            <label className="check-item"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/>启用此提供商</label>
          </div>
          <section className="provider-test-section">
            <div className="settings-form-heading"><div><h3>连接测试</h3><small>每个 API 配置都需要完成基础连接与真实图片能力测试。</small></div></div>
            {editingProvider?<div className="syc-test-grid">
              <article><b>基础连接</b><span>{editingProvider.lastTestStatus==="success"?"成功":editingProvider.lastTestStatus==="failed"?"失败":"未测试"}</span><small>{editingProvider.lastTestAt?new Date(editingProvider.lastTestAt).toLocaleString("zh-CN"):"读取模型或服务状态"}</small>{editingProvider.lastError&&<p className="danger-text">{editingProvider.lastError}</p>}<button className="secondary" disabled={!!busy} onClick={()=>void test(editingProvider,"connection")}>{busy===`${editingProvider.id}:connection`?"测试中…":"测试连接"}</button></article>
              <article><b>真实图片能力</b><span>{editingProvider.lastImageTestStatus==="success"?"可用":editingProvider.lastImageTestStatus==="failed"?"失败":"未测试"}</span><small>{editingProvider.lastImageTestAt?new Date(editingProvider.lastImageTestAt).toLocaleString("zh-CN"):(editingProvider.type==="bfl"||editingProvider.type==="fashn"?"使用已保存的服装图与模特图测试":"会产生一次真实模型调用")}</small>{editingProvider.lastImageTestError&&<p className="danger-text">{editingProvider.lastImageTestError}</p>}{testImage&&<a href={testImage} target="_blank" rel="noreferrer"><img src={testImage} alt={`${editingProvider.name}真实图片测试结果`}/></a>}<button className="secondary" disabled={!!busy} onClick={()=>void test(editingProvider,"image")}>{busy===`${editingProvider.id}:image`?"生成中…":"测试图片生成"}</button></article>
            </div>:<div className="notice">请先保存当前 API 配置，再运行两项测试。</div>}
          </section>
          <div className="settings-dialog-actions">
            {editingProvider&&<button className="danger" disabled={!!busy} onClick={()=>void remove(editingProvider)}>删除配置</button>}
            <span/>
            <button className="secondary" disabled={!!busy} onClick={closeDialog}>取消</button>
            <button className="primary" disabled={!!busy||!form.name||!form.baseUrl||!form.defaultModel||(!editingId&&!form.apiKey)} onClick={()=>void submit()}>{busy==="save"?"保存中…":editingId?"保存修改":"保存配置"}</button>
          </div>
          <div className="notice">填写 API 根地址时，兼容接口会自动使用图片生成端点；也可以填写完整图片编辑端点。保存后无需把完整密钥显示在网页上。</div>
        </div>
      </section>
    </div>}

    {dialog==="workflow"&&<div className="settings-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)closeDialog()}}>
      <section className="settings-dialog workflow-dialog" role="dialog" aria-modal="true" aria-label="工作流模型分配">
        <header className="settings-dialog-head"><div><small>WORKFLOW ROUTING</small><h2>工作流模型分配</h2><p>主模型失败时，可由用户手动选择备用模型重试。</p></div><button className="settings-dialog-close" aria-label="关闭配置" onClick={closeDialog}>×</button></header>
        <div className="settings-dialog-body">
          {(error||message)&&<div className={error?"error":"notice"}>{error||message}</div>}
          <div className="workflow-binding-grid">{WORKFLOWS.map(workflow=>{const current=bindings[workflow.key],summary=runtime[workflow.key];return <article className="binding-card" key={workflow.key}><h3>{workflow.label}</h3><p>{workflow.description}</p>{(["primary","fallback"] as const).map(slot=><div className="binding-slot" key={slot}><b>{slot==="primary"?"主模型":"备用模型"}</b><select value={current[slot]?.providerId||""} onChange={e=>updateSelection(workflow.key,slot,e.target.value)}><option value="">{slot==="primary"?environmentOptionLabel(summary.primary):"不配置备用模型"}</option>{enabledProviders.map(provider=><option value={provider.id} key={provider.id}>{providerOptionLabel(provider)}</option>)}</select><input disabled={!current[slot]} value={current[slot]?.model||""} onChange={e=>updateModel(workflow.key,slot,e.target.value)} placeholder="模型名称"/><small className={summary[slot].configured?"binding-ok":"binding-warn"}>{summary[slot].configured?`当前：${summary[slot].providerName} / ${summary[slot].model}`:summary[slot].error||"未配置"}</small></div>)}</article>})}</div>
          <div className="settings-dialog-actions"><span/><button className="secondary" disabled={!!busy} onClick={closeDialog}>取消</button><button className="primary" disabled={!!busy} onClick={()=>void saveBindings()}>{busy==="bindings"?"保存中…":"保存工作流模型分配"}</button></div>
        </div>
      </section>
    </div>}
  </div>;
}
