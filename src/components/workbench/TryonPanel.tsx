"use client";

import {useMemo,useState} from "react";
import type {PanelProps} from "./types";
import type {ProductType} from "@/lib/db";
import AssetUploadCard,{type LocalAsset} from "./AssetUploadCard";
import ImagePreviewDialog from "./ImagePreviewDialog";
import ResultCard from "./ResultCard";
import ConsistencyCheck from "./ConsistencyCheck";
import ClearAssetsButton from "./ClearAssetsButton";
import ClearResultsButton from "./ClearResultsButton";
import {hasClearableSourceAssets} from "@/lib/asset-cleanup";
import {hasWorkflowResults} from "@/lib/result-cleanup";
import {buildProductProtectionPrompt} from "@/lib/product-structure";
import {TRYON_MODE_OPTIONS,TRYON_PRODUCT_TYPE_OPTIONS,TRYON_PROTECTION_LABELS,TRYON_PROTECTION_OPTIONS} from "@/lib/tryon-options";
import {canConfirmTryonSelection} from "@/lib/tryon-confirmation";
import {useProjectDraftAutosave} from "./useProjectDraftAutosave";
import {composeTryonDetailRequirements} from "@/lib/tryon-detail-requirements";
import type {Job} from "@/lib/db";

const DETAILS="保持服装领口、袖口、肩部、下摆、纽扣数量、印花位置、白色包边、面料纹理和服装长度，不得增加或删除口袋、腰带、纽扣、印花或装饰。";

export default function TryonPanel({p,jobs,historyJobs,health,modelRouting,busy,run,persistAsset,deleteAsset,clearSourceAssets,clearWorkflowResults,saveProject,post,confirmFlow}:PanelProps&{historyJobs:Job[]}){
  const saved=p.settings.tryon;
  const [garment,setGarment]=useState<LocalAsset>({url:p.assets.garmentImage,name:"已保存服装图",status:p.assets.garmentImage?"saved":"idle"});
  const [model,setModel]=useState<LocalAsset>({url:p.assets.modelReferenceImage||p.assets.modelImage,name:"已保存模特图",status:(p.assets.modelReferenceImage||p.assets.modelImage)?"saved":"idle"});
  const [description,setDescription]=useState(saved?.garmentDescription||"");
  const [productType,setProductType]=useState<ProductType|"">(saved?.productType||p.productType||"");
  const [extra,setExtra]=useState(()=>{const value=saved?.extraRequirements||(saved?.detailRequirements&&saved.detailRequirements.length<=800?saved.detailRequirements:DETAILS);return value.length>800?value.slice(0,800):value});
  const [mode,setMode]=useState<"fast"|"standard"|"quality">(saved?.mode||"standard");
  const [face,setFace]=useState(saved?.face??false);
  const [count,setCount]=useState(saved?.candidateCount||2);
  const [selected,setSelected]=useState(p.confirmedTryonImage||saved?.selectedCandidateImage||"");
  const [candidateSlot,setCandidateSlot]=useState(saved?.activeCandidateSlot||1);
  const [protectedItems,setProtected]=useState(saved?.protectedItems?.length?saved.protectedItems:[...new Set([...TRYON_PROTECTION_LABELS,...(p.profile?.protectionItems||[])])]);
  const [preview,setPreview]=useState<{images:string[];index:number}|null>(null);
  const [revisionRequest,setRevisionRequest]=useState(saved?.revisionRequest||"");
  const [revisionMessages,setRevisionMessages]=useState(saved?.revisionMessages||[]);
  const [historyJobId,setHistoryJobId]=useState("");
  const route=modelRouting.tryon,routed=route.primary.source==="stored";
  const standardProvider=routed?route.primary.model:health.tryonProvider==="custom"?"自定义模型":health.tryonProvider==="volcengine"?"Seedream 5.0":"BFL VTO";
  const configured=routed?route.primary.configured:health.tryonProvider==="custom"?health.custom:mode==="quality"?health.fashn:health.tryonProvider==="volcengine"?health.volcengine:health.bfl;
  const modelName=routed?route.primary.model:health.tryonProvider==="custom"?"自定义图像 API":mode==="quality"?"FASHN Try-On Max":health.tryonProvider==="volcengine"?"Doubao Seedream 5.0":"BFL FLUX Virtual Try-On";
  const historyItems=historyJobs.filter(job=>job.outputImages[0]&&job.status!=="failed"&&job.status!=="interrupted");
  const allImages=[...new Set([garment.url,model.url,...historyItems.flatMap(j=>j.outputImages)].filter(Boolean))] as string[];
  const structurePrompt=buildProductProtectionPrompt(productType||p.productType,p.profile),missing=[!garment.url&&"服装产品图",!model.url&&"模特参考图"].filter(Boolean) as string[];
  const canConfirmSelected=canConfirmTryonSelection(selected,historyJobs);
  const candidateTotal=Math.max(count,jobs.length,1),activeCandidate=Math.min(candidateSlot,candidateTotal),historyJob=historyItems.find(job=>job.id===historyJobId),visibleJob=historyJob||jobs.find(job=>job.slot===activeCandidate),visibleUrl=visibleJob?.outputImages[0];
  const draftSettings=useMemo(()=>({settings:{...p.settings,tryon:{mode,candidateCount:count,productType:productType||p.productType,garmentDescription:description,detailRequirements:extra,extraRequirements:extra,protectedItems,face,selectedCandidateImage:selected||undefined,activeCandidateSlot:candidateSlot,revisionRequest,revisionMessages}}}),[candidateSlot,count,description,extra,face,mode,p.productType,p.settings,productType,protectedItems,revisionMessages,revisionRequest,selected]);
  useProjectDraftAutosave(p.id,draftSettings);

  async function saveAsset(asset:LocalAsset,key:"garmentImage"|"modelReferenceImage",name:string,setter:(asset:LocalAsset)=>void){
    setter({...asset,status:"uploading"});
    try{const url=await persistAsset(asset.file,key,name);setter({...asset,url,file:undefined,status:"saved"})}
    catch(error){setter({...asset,status:"failed",error:error instanceof Error?error.message:"上传失败"});throw error}
  }
  async function saveSettings(){if(!productType)throw new Error("请先选择服装类型");await saveProject({productType,...draftSettings})}
  async function clearAllAssets(){await clearSourceAssets();setGarment({status:"idle"});setModel({status:"idle"});setPreview(null)}
  async function clearResults(){await clearWorkflowResults("tryon");setSelected("");setHistoryJobId("");setPreview(null)}
  async function start(slot?:number,modelPreference:"primary"|"fallback"="primary"){
    if(!productType)throw new Error("请先选择服装类型");
    if(!garment.url||!model.url)throw new Error("两张图片必须保存成功后才能生成");
    await saveSettings();
    await post("/api/tryon",{projectId:p.id,productType,garmentImage:garment.url,modelImage:model.url,garmentDescription:description,detailRequirements:composeTryonDetailRequirements(structurePrompt,`${protectedItems.join("；")}。`,extra),extraRequirements:extra,face,mode,candidateCount:slot?1:count,modelPreference,...(slot?{slot}:{})});
  }
  async function checkConsistency(jobId:string){await post(`/api/projects/${p.id}/consistency-check`,{jobId})}
  async function reviseCandidate(){
    const request=revisionRequest.trim();
    if(!request)throw new Error("请先告诉工作台需要修改什么");
    if(!visibleUrl||!visibleJob)throw new Error("请先生成并选择一张候选图");
    const now=new Date().toISOString(),messages=[...revisionMessages,{id:crypto.randomUUID(),role:"user" as const,content:request,createdAt:now},{id:crypto.randomUUID(),role:"assistant" as const,content:"已收到。我会只修改你指出的问题，同时锁定原产品的版型、材质、纹理、颜色、包边与其他细节。此修改为可选步骤，不影响你直接确认当前结果。",createdAt:now}];
    setRevisionMessages(messages);setRevisionRequest("");
    await saveProject({settings:{...p.settings,tryon:{...draftSettings.settings.tryon,revisionRequest:"",revisionMessages:messages}}});
    await post(`/api/jobs/${visibleJob.id}/retry`,{correctionRequest:request,modelPreference:"primary"});
  }

  return <>
<div className="workbench-grid">
    <section className="card workbench-panel tryon-input-panel">
<div className="panel-head">
<h2>输入素材</h2>
<div className="panel-actions"><small>选择后立即保存</small><ClearAssetsButton disabled={busy||!hasClearableSourceAssets(p)} onConfirm={clearAllAssets}/></div>
</div>
<label className="field">
<b>第一步：先选择服装类型</b>
<select value={productType} onChange={e=>setProductType(e.target.value as ProductType)} required>
<option value="" disabled>请选择服装类型</option>{TRYON_PRODUCT_TYPE_OPTIONS.map(option=>
<option key={option.id} value={option.value}>{option.label}</option>)}</select>
<small>生成时将严格按照所选服装类目处理。</small>
</label>
    <div className="upload-pair">
      <AssetUploadCard label="服装产品图" description="上传真实服装产品图" value={garment} onChange={a=>run(()=>saveAsset(a,"garmentImage","garment",setGarment))} onDelete={()=>run(async()=>{await deleteAsset("garmentImage");setGarment({status:"idle"})})} onPreview={()=>garment.url&&setPreview({images:allImages,index:allImages.indexOf(garment.url)})}/>
      <AssetUploadCard label="模特参考图" description="只参考姿势、场景和背景，不参考模特服装" value={model} onChange={a=>run(()=>saveAsset(a,"modelReferenceImage","model-reference",setModel))} onDelete={()=>run(async()=>{await deleteAsset("modelReferenceImage");setModel({status:"idle"})})} onPreview={()=>model.url&&setPreview({images:allImages,index:allImages.indexOf(model.url)})}/>
    </div>
<section className="tryon-generation-history" aria-labelledby="tryon-generation-history-title">
<div className="tryon-history-head"><div><h3 id="tryon-generation-history-title">生成历史</h3><small>点击小图回到之前生成的照片</small></div><span>{historyItems.length} 张</span></div>
{historyItems.length?<div className="tryon-history-grid">{historyItems.map((job,index)=>{const url=job.outputImages[0],active=job.id===historyJobId;return <button type="button" className={active?"active":""} key={job.id} onClick={()=>{setHistoryJobId(job.id);setCandidateSlot(job.slot||1)}} title={`查看 ${new Date(job.startedAt).toLocaleString("zh-CN")}`} aria-label={`查看历史生成图 ${index+1}`}><img src={url} alt={`历史生成图 ${index+1}`}/><span>{new Date(job.startedAt).toLocaleDateString("zh-CN",{month:"2-digit",day:"2-digit"})}</span></button>})}</div>:<div className="tryon-history-empty">生成过的换装照片会保存在这里</div>}
</section>
{missing.length>0&&<div className="notice">开始换装前还需要保存：{missing.join("、")}。</div>}
<label className="field">服装描述<textarea maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/>
<span className="field-count">{description.length}/500</span>
</label>
<label className="field tryon-detail-field">重点细节要求<small>产品图识别出的版型、面料、纹理、领口、袖口、包边、拼接、色块和装饰会由服务端自动叠加；这里可继续补充或修正。</small><textarea maxLength={800} value={extra} onChange={e=>setExtra(e.target.value)}/>
<span className="field-count">{extra.length}/800</span>
</label>
<button className="secondary" onClick={()=>run(saveSettings)}>保存换装设置</button>
</section>
    <section className="card workbench-panel tryon-results-panel">
<div className="panel-head">
<h2>换装结果（候选图）</h2>
<div className="panel-actions"><div className="tryon-candidate-tabs">{Array.from({length:candidateTotal},(_,index)=>index+1).map(slot=><button type="button" className={!historyJob&&activeCandidate===slot?"active":""} key={slot} onClick={()=>{setHistoryJobId("");setCandidateSlot(slot)}}>候选{String(slot).padStart(2,"0")}</button>)}</div><ClearResultsButton workflow="tryon" disabled={busy||!hasWorkflowResults(p,jobs,"tryon")} onConfirm={clearResults}/></div>
</div><div className="tryon-result-layout">{visibleJob?<div className="result-grid tryon-single-result"><div><ResultCard key={`tryon-result-${visibleJob.id}`} job={visibleJob} label={historyJob?`历史生成 · 候选 ${String(visibleJob.slot||1).padStart(2,"0")}`:`候选 ${String(activeCandidate).padStart(2,"0")}`} selected={selected===visibleUrl} onSelect={visibleUrl?()=>setSelected(visibleUrl):undefined} onPreview={visibleUrl?()=>setPreview({images:allImages,index:allImages.indexOf(visibleUrl)}):undefined} onRetry={()=>run(()=>start(visibleJob.slot||activeCandidate))} onFallbackRetry={route.fallback.configured?()=>run(()=>start(visibleJob.slot||activeCandidate,"fallback")):undefined} onCorrect={request=>run(()=>post(`/api/jobs/${visibleJob.id}/retry`,{correctionRequest:request}))} correctionBusy={busy}/><ConsistencyCheck job={visibleJob} busy={busy} onCheck={()=>run(()=>checkConsistency(visibleJob.id))}/></div></div>:<div className="empty-state">
<div>
<div className="empty-icon">◇</div>
<b>还没有换装候选</b>
<p>上传两张输入图片后即可开始换装。</p>
</div>
</div>}<div className="tryon-side-column"><div className="tryon-agent"><div className="panel-head"><div><h3>工作台智能修改（可选）</h3><small>不修改也可以直接确认并进入三种姿势。</small></div></div>{revisionMessages.length?<div className="agent-messages">{revisionMessages.slice(-6).map(message=><div key={message.id} className={`agent-message ${message.role}`}><b>{message.role==="user"?"我":"工作台"}</b><span>{message.content}</span></div>)}</div>:<div className="notice">如果候选图的衣长、领口、袖口、材质、纹理、包边或其他细节不准确，可在这里说明后重新生成当前候选。</div>}<label className="field">告诉工作台需要修改什么<textarea maxLength={800} placeholder="例如：保持当前人物和构图，只把领口恢复为原产品的不对称黑色包边，并保持针织罗纹密度。" value={revisionRequest} onChange={event=>setRevisionRequest(event.target.value)}/><span className="field-count">{revisionRequest.length}/800</span></label><button className="secondary" disabled={busy||!visibleUrl||!revisionRequest.trim()} onClick={()=>run(reviseCandidate)}>按对话要求修改当前候选</button></div><div className="tryon-settings-inline"><div className="panel-head"><div><h3>生成设置</h3><small>真实模型状态</small></div></div><div className="tryon-setting-group"><h3 className="section-label">生成模式</h3><div className="mode-grid">{TRYON_MODE_OPTIONS.map(option=>{const sub=option.id==="quality"?(routed?route.primary.model:health.tryonProvider==="custom"?"自定义模型":"FASHN Try-On Max"):standardProvider;return <button key={`tryon-mode-${option.id}`} className={`mode-card ${mode===option.id?"active":""}`} onClick={()=>setMode(option.id)}><b>{option.label}</b><small>{sub}</small>{option.id==="quality"&&!routed&&health.tryonProvider!=="custom"&&!health.fashn&&<em>未配置</em>}</button>})}</div></div><div className="tryon-setting-group"><h3 className="section-label">候选数量</h3><div className="segment"><button className={count===1?"active":""} onClick={()=>setCount(1)}>生成1张</button><button className={count===2?"active":""} onClick={()=>setCount(2)}>生成2张</button></div></div><div className="tryon-setting-group"><h3 className="section-label">人物显示</h3><label className="check-item face-visibility-toggle"><input type="checkbox" checked={face} onChange={event=>setFace(event.target.checked)}/>露出脸部</label><small className="setting-help">{face?"已开启：允许露出并保持原模特脸部。":"默认关闭：生成结果不得露出或补画脸部。"}</small></div><div className="tryon-setting-group"><h3 className="section-label">细节保护</h3><div className="protection-grid">{TRYON_PROTECTION_OPTIONS.map(option=><label className="check-item" key={`tryon-protection-${option.id}`}><input type="checkbox" checked={protectedItems.includes(option.label)} onChange={()=>setProtected(value=>value.includes(option.label)?value.filter(item=>item!==option.label):[...value,option.label])}/>{option.label}</label>)}</div><details className="structure-prompt-preview"><summary>查看自动组成的商品结构保护提示</summary><pre>{structurePrompt}</pre></details></div><div className="tryon-setting-group"><div className="model-card"><div className="model-row"><span>{modelName}</span><span className={`badge ${configured?"success":"failed"}`}>{configured?"可用":"未配置"}</span></div><small>提供商：{route.primary.providerName}</small><small>备用模型：{route.fallback.configured?`${route.fallback.providerName} / ${route.fallback.model}`:"未配置"}</small>{mode==="quality"&&!routed&&health.tryonProvider!=="custom"&&<small>精细模式使用 FASHN quality · 2K，每张候选独立生成。</small>}</div><div className="cost-card">{mode==="quality"&&health.tryonProvider!=="custom"?"FASHN 预计消耗：每张 4 credits":"预计费用暂不可用"}</div></div><div className="tryon-setting-group"><div className="generate-footer"><button className="primary" disabled={busy||!productType||!garment.url||!model.url||!configured} onClick={()=>run(()=>start())}>{busy?"处理中…":"▷ 开始换装"}</button><div className="status-line">{configured?"输入与设置会保存在当前项目":health.tryonProvider==="custom"?"请先在服务器完成自定义图像 API 配置":mode==="quality"?"请先在服务器配置 FASHN_API_KEY，配置后重启工作台":"当前模型 API 尚未配置"}</div></div></div></div></div></div><div className="confirm-block">
<button className="primary" disabled={!canConfirmSelected} onClick={()=>run(()=>confirmFlow("tryon",[selected]))}>✓ 确认选中的换装结果</button>
<p>确认后可进入三种姿势</p>
</div>
    </section>
  </div>{preview&&<ImagePreviewDialog {...preview} onClose={()=>setPreview(null)}/>}</>;
}
