"use client";

import {useMemo,useState} from "react";
import type {ApiProviderPublic,ApiProviderType,WorkflowModelBindings,WorkflowRuntimeSummary} from "@/lib/ai/provider-settings-types";
import type {WorkflowType} from "@/lib/ai/types";

type FormState={name:string;type:ApiProviderType;baseUrl:string;apiKey:string;defaultModel:string;enabled:boolean;notes:string};
const emptyForm:FormState={name:"",type:"openai-compatible",baseUrl:"",apiKey:"",defaultModel:"",enabled:true,notes:""};
const TYPE_LABEL:Record<ApiProviderType,string>={"openai-compatible":"OpenAI兼容中转站",fashn:"FASHN",bfl:"BFL / FLUX",volcengine:"火山方舟",flux:"FLUX兼容接口",custom:"自定义兼容接口"};
const WORKFLOWS:{key:WorkflowType;label:string;description:string}[]=[{key:"tryon",label:"服装换装",description:"服装图＋模特图生成换装候选"},{key:"pose",label:"三种姿势",description:"三次独立图片编辑任务"},{key:"recolor",label:"服装复色",description:"三张姿势图分别精准复色"}];

async function requestJson(url:string,init?:RequestInit){const response=await fetch(url,{...init,headers:{"Content-Type":"application/json",...(init?.headers||{})}});const data=response.status===204?null:await response.json();if(!response.ok)throw new Error(data?.error||"操作失败");return data}

export default function ProviderSettingsManager({initialProviders,initialBindings,initialRuntime}:{initialProviders:ApiProviderPublic[];initialBindings:WorkflowModelBindings;initialRuntime:WorkflowRuntimeSummary}){
  const [providers,setProviders]=useState(initialProviders),[bindings,setBindings]=useState(initialBindings),[runtime,setRuntime]=useState(initialRuntime),[form,setForm]=useState<FormState>(emptyForm),[editingId,setEditingId]=useState<string>(),[busy,setBusy]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState("");
  const enabledProviders=useMemo(()=>providers.filter(provider=>provider.enabled),[providers]);
  function resetForm(){setEditingId(undefined);setForm(emptyForm)}
  function edit(provider:ApiProviderPublic){setEditingId(provider.id);setForm({name:provider.name,type:provider.type,baseUrl:provider.baseUrl,apiKey:"",defaultModel:provider.defaultModel,enabled:provider.enabled,notes:provider.notes||""});setMessage("");setError("")}
  async function reload(){const [providerData,bindingData]=await Promise.all([requestJson("/api/settings/providers"),requestJson("/api/settings/workflow-models")]);setProviders(providerData);setBindings(bindingData.bindings);setRuntime(bindingData.runtime)}
  async function submit(){setBusy("save");setError("");setMessage("");try{const body={...form,...(editingId&&!form.apiKey?{apiKey:undefined}:{})};await requestJson(editingId?`/api/settings/providers/${editingId}`:"/api/settings/providers",{method:editingId?"PUT":"POST",body:JSON.stringify(body)});await reload();resetForm();setMessage(editingId?"API配置已更新":"API配置已新增")}catch(e){setError(e instanceof Error?e.message:"保存失败")}finally{setBusy("")}}
  async function remove(provider:ApiProviderPublic){if(!confirm(`确认删除“${provider.name}”？相关工作流绑定会同时清除。`))return;setBusy(provider.id);setError("");try{await requestJson(`/api/settings/providers/${provider.id}`,{method:"DELETE"});await reload();if(editingId===provider.id)resetForm();setMessage("API配置已删除")}catch(e){setError(e instanceof Error?e.message:"删除失败")}finally{setBusy("")}}
  async function test(provider:ApiProviderPublic,mode:"connection"|"image"){if(mode==="image"&&!confirm(`图片能力测试会真实调用“${provider.name}”并可能产生费用，确认继续？`))return;setBusy(`${provider.id}:${mode}`);setError("");setMessage("");try{const data=await requestJson(`/api/settings/providers/${provider.id}/test`,{method:"POST",body:JSON.stringify({mode})});await reload();setMessage(data.message)}catch(e){await reload();setError(e instanceof Error?e.message:"测试失败")}finally{setBusy("")}}
  function updateSelection(workflow:WorkflowType,slot:"primary"|"fallback",providerId:string){const provider=providers.find(item=>item.id===providerId);setBindings(current=>({...current,[workflow]:{...current[workflow],[slot]:provider?{providerId:provider.id,model:provider.defaultModel}:undefined}}))}
  function updateModel(workflow:WorkflowType,slot:"primary"|"fallback",model:string){setBindings(current=>{const selection=current[workflow][slot];return selection?{...current,[workflow]:{...current[workflow],[slot]:{...selection,model}}}:current})}
  async function saveBindings(){setBusy("bindings");setError("");setMessage("");try{const data=await requestJson("/api/settings/workflow-models",{method:"PUT",body:JSON.stringify(bindings)});setBindings(data.bindings);setRuntime(data.runtime);setMessage("三个工作流的主模型与备用模型已保存")}catch(e){setError(e instanceof Error?e.message:"模型绑定保存失败")}finally{setBusy("")}}

  return <div className="settings-stack">
    {(error||message)&&<div className={error?"error":"notice"}>{error||message}</div>}
    <section className="card">
      <div className="panel-head"><div><h2>API提供商列表</h2><small>密钥只保存在服务器，页面仅显示掩码</small></div><span className="badge">{providers.length} 个配置</span></div>
      {providers.length?<div className="provider-list">{providers.map(provider=><article className={`provider-card ${provider.enabled?"":"disabled"}`} key={provider.id}>
        <div className="provider-card-main"><div><div className="provider-title"><b>{provider.name}</b><span className={`badge ${provider.enabled?"success":"wait"}`}>{provider.enabled?"已启用":"已停用"}</span><span className={`badge ${provider.lastTestStatus==="success"?"success":provider.lastTestStatus==="failed"?"failed":"wait"}`}>{provider.lastTestStatus==="success"?"测试成功":provider.lastTestStatus==="failed"?"测试失败":"未测试"}</span></div><small>{TYPE_LABEL[provider.type]} · {provider.defaultModel}</small></div><code>{provider.apiKeyMasked}</code></div>
        <dl className="provider-meta"><div><dt>Base URL</dt><dd>{provider.baseUrl}</dd></div><div><dt>最后测试</dt><dd>{provider.lastTestAt?new Date(provider.lastTestAt).toLocaleString("zh-CN"):"尚未测试"}</dd></div>{provider.lastError&&<div><dt>错误</dt><dd className="danger-text">{provider.lastError}</dd></div>}</dl>
        <div className="provider-actions"><button className="secondary" disabled={!!busy} onClick={()=>void test(provider,"connection")}>{busy===`${provider.id}:connection`?"测试中…":"测试连接"}</button><button className="secondary" disabled={!!busy||provider.type==="bfl"||provider.type==="fashn"} onClick={()=>void test(provider,"image")}>{busy===`${provider.id}:image`?"生成中…":"测试图片能力"}</button><button className="text-button" disabled={!!busy} onClick={()=>edit(provider)}>编辑</button><button className="text-button danger-text" disabled={!!busy} onClick={()=>void remove(provider)}>删除</button></div>
      </article>)}</div>:<div className="empty-state"><div><div className="empty-icon">◇</div><b>还没有自定义API提供商</b><p>下方新增一个中转站配置；原有环境变量模型仍可继续使用。</p></div></div>}
    </section>

    <section className="card">
      <div className="panel-head"><div><h2>{editingId?"编辑API配置":"新增API配置"}</h2><small>OpenAI兼容中转站可填写 API 根地址或完整图片端点</small></div>{editingId&&<button className="text-button" onClick={resetForm}>取消编辑</button>}</div>
      <div className="provider-form form-grid">
        <label className="field">配置名称<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="例如：我的中转站1"/></label>
        <label className="field">提供商类型<select value={form.type} onChange={e=>setForm({...form,type:e.target.value as ApiProviderType})}>{Object.entries(TYPE_LABEL).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field full">Base URL<input value={form.baseUrl} onChange={e=>setForm({...form,baseUrl:e.target.value})} placeholder="https://example.com/v1"/></label>
        <label className="field">API Key<input type="password" autoComplete="new-password" value={form.apiKey} onChange={e=>setForm({...form,apiKey:e.target.value})} placeholder={editingId?"留空表示不修改":"只发送到本机服务器"}/></label>
        <label className="field">默认模型<input value={form.defaultModel} onChange={e=>setForm({...form,defaultModel:e.target.value})} placeholder="模型名称或接入点ID"/></label>
        <label className="field full">备注<textarea maxLength={500} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="可选：用途、额度或模型说明"/></label>
        <label className="check-item"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/>启用此提供商</label>
      </div>
      <div className="actions"><button className="primary" disabled={!!busy||!form.name||!form.baseUrl||!form.defaultModel||(!editingId&&!form.apiKey)} onClick={()=>void submit()}>{busy==="save"?"保存中…":editingId?"保存修改":"新增API配置"}</button></div>
      <div className="notice">如果填写 API 根地址（例如 <code>https://example.com/v1</code>），系统调用 <code>/images/generations</code>；如果填写完整 <code>/images/edits</code> 地址，则使用兼容的图片编辑表单请求。</div>
    </section>

    <section className="card">
      <div className="panel-head"><div><h2>工作流模型分配</h2><small>本轮采用手动备用模型重试，不会自动产生第二次费用</small></div><span className="badge">主模型＋备用模型</span></div>
      <div className="workflow-binding-grid">{WORKFLOWS.map(workflow=>{const current=bindings[workflow.key],summary=runtime[workflow.key];return <article className="binding-card" key={workflow.key}><h3>{workflow.label}</h3><p>{workflow.description}</p>{(["primary","fallback"] as const).map(slot=><div className="binding-slot" key={slot}><b>{slot==="primary"?"主模型":"备用模型"}</b><select value={current[slot]?.providerId||""} onChange={e=>updateSelection(workflow.key,slot,e.target.value)}><option value="">{slot==="primary"?"使用现有环境变量配置":"不配置备用模型"}</option>{enabledProviders.map(provider=><option value={provider.id} key={provider.id}>{provider.name} · {TYPE_LABEL[provider.type]}</option>)}</select><input disabled={!current[slot]} value={current[slot]?.model||""} onChange={e=>updateModel(workflow.key,slot,e.target.value)} placeholder="模型名称"/><small className={summary[slot].configured?"binding-ok":"binding-warn"}>{summary[slot].configured?`当前：${summary[slot].providerName} / ${summary[slot].model}`:summary[slot].error||"未配置"}</small></div>)}</article>})}</div>
      <div className="actions"><button className="primary" disabled={!!busy} onClick={()=>void saveBindings()}>{busy==="bindings"?"保存中…":"保存工作流模型分配"}</button></div>
    </section>
  </div>;
}
