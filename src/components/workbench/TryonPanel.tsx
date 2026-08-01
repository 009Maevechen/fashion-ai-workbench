"use client";

import {useState} from "react";
import type {PanelProps} from "./types";
import type {ProductType} from "@/lib/db";
import AssetUploadCard,{type LocalAsset} from "./AssetUploadCard";
import ImagePreviewDialog from "./ImagePreviewDialog";
import ResultCard from "./ResultCard";
import ClearAssetsButton from "./ClearAssetsButton";
import ClearResultsButton from "./ClearResultsButton";
import {hasClearableSourceAssets} from "@/lib/asset-cleanup";
import {hasWorkflowResults} from "@/lib/result-cleanup";
import {buildProductProtectionPrompt} from "@/lib/product-structure";
import {TRYON_MODE_OPTIONS,TRYON_PRODUCT_TYPE_OPTIONS,TRYON_PROTECTION_LABELS,TRYON_PROTECTION_OPTIONS} from "@/lib/tryon-options";
import {canConfirmTryonSelection} from "@/lib/tryon-confirmation";

const DETAILS="保持服装领口、袖口、肩部、下摆、纽扣数量、印花位置、白色包边、面料纹理和服装长度，不得增加或删除口袋、腰带、纽扣、印花或装饰。";

export default function TryonPanel({p,jobs,health,modelRouting,busy,run,persistAsset,deleteAsset,clearSourceAssets,clearWorkflowResults,saveProject,post,confirmFlow}:PanelProps){
  const saved=p.settings.tryon;
  const [garment,setGarment]=useState<LocalAsset>({url:p.assets.garmentImage,name:"已保存服装图",status:p.assets.garmentImage?"saved":"idle"});
  const [model,setModel]=useState<LocalAsset>({url:p.assets.modelReferenceImage||p.assets.modelImage,name:"已保存模特图",status:(p.assets.modelReferenceImage||p.assets.modelImage)?"saved":"idle"});
  const [description,setDescription]=useState(saved?.garmentDescription||"");
  const [productType,setProductType]=useState<ProductType|"">(saved?.productType||p.productType||"");
  const [extra,setExtra]=useState(saved?.detailRequirements||DETAILS);
  const [mode,setMode]=useState<"fast"|"standard"|"quality">(saved?.mode||"standard");
  const [face,setFace]=useState(saved?.face??false);
  const [count,setCount]=useState(saved?.candidateCount||2);
  const [selected,setSelected]=useState(p.confirmedTryonImage||"");
  const [protectedItems,setProtected]=useState(saved?.protectedItems?.length?saved.protectedItems:[...new Set([...TRYON_PROTECTION_LABELS,...(p.profile?.protectionItems||[])])]);
  const [preview,setPreview]=useState<{images:string[];index:number}|null>(null);
  const route=modelRouting.tryon,routed=route.primary.source==="stored";
  const standardProvider=routed?route.primary.model:health.tryonProvider==="custom"?"自定义模型":health.tryonProvider==="volcengine"?"Seedream 5.0":"BFL VTO";
  const configured=routed?route.primary.configured:health.tryonProvider==="custom"?health.custom:mode==="quality"?health.fashn:health.tryonProvider==="volcengine"?health.volcengine:health.bfl;
  const modelName=routed?route.primary.model:health.tryonProvider==="custom"?"自定义图像 API":mode==="quality"?"FASHN Try-On Max":health.tryonProvider==="volcengine"?"Doubao Seedream 5.0":"BFL FLUX Virtual Try-On";
  const allImages=[...new Set([garment.url,model.url,...jobs.flatMap(j=>j.outputImages)].filter(Boolean))] as string[];
  const structurePrompt=buildProductProtectionPrompt(productType||p.productType,p.profile),missing=[!garment.url&&"服装产品图",!model.url&&"模特参考图"].filter(Boolean) as string[];
  const canConfirmSelected=canConfirmTryonSelection(selected,jobs);

  async function saveAsset(asset:LocalAsset,key:"garmentImage"|"modelReferenceImage",name:string,setter:(asset:LocalAsset)=>void){
    setter({...asset,status:"uploading"});
    try{const url=await persistAsset(asset.file,key,name);setter({...asset,url,file:undefined,status:"saved"})}
    catch(error){setter({...asset,status:"failed",error:error instanceof Error?error.message:"上传失败"});throw error}
  }
  async function saveSettings(){if(!productType)throw new Error("请先选择服装类型");await saveProject({productType,settings:{...p.settings,tryon:{mode,candidateCount:count,productType,garmentDescription:description,detailRequirements:extra,protectedItems,face}}})}
  async function clearAllAssets(){await clearSourceAssets();setGarment({status:"idle"});setModel({status:"idle"});setPreview(null)}
  async function clearResults(){await clearWorkflowResults("tryon");setSelected("");setPreview(null)}
  async function start(slot?:number,modelPreference:"primary"|"fallback"="primary"){
    if(!productType)throw new Error("请先选择服装类型");
    if(!garment.url||!model.url)throw new Error("两张图片必须保存成功后才能生成");
    await saveSettings();
    await post("/api/tryon",{projectId:p.id,productType,garmentImage:garment.url,modelImage:model.url,garmentDescription:description,detailRequirements:`${structurePrompt}\n${protectedItems.join("；")}。${extra}`,face,mode,candidateCount:slot?1:count,modelPreference,...(slot?{slot}:{})});
  }

  return <>
<div className="workbench-grid">
    <section className="card workbench-panel">
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
      <AssetUploadCard label="模特参考图" description="保留模特、姿势、构图和背景" value={model} onChange={a=>run(()=>saveAsset(a,"modelReferenceImage","model-reference",setModel))} onDelete={()=>run(async()=>{await deleteAsset("modelReferenceImage");setModel({status:"idle"})})} onPreview={()=>model.url&&setPreview({images:allImages,index:allImages.indexOf(model.url)})}/>
    </div>
{missing.length>0&&<div className="notice">开始换装前还需要保存：{missing.join("、")}。</div>}
<label className="field">服装描述<textarea maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/>
<span className="field-count">{description.length}/500</span>
</label>
<label className="field">重点细节要求<textarea maxLength={800} value={extra} onChange={e=>setExtra(e.target.value)}/>
<span className="field-count">{extra.length}/800</span>
</label>
<button className="secondary" onClick={()=>run(saveSettings)}>保存换装设置</button>
</section>
    <section className="card workbench-panel">
<div className="panel-head">
<h2>换装结果（候选图）</h2>
<div className="panel-actions"><span className="badge">共 {Math.max(count,jobs.length)} 张候选</span><ClearResultsButton workflow="tryon" disabled={busy||!hasWorkflowResults(p,jobs,"tryon")} onConfirm={clearResults}/></div>
</div>{jobs.length?<div className="result-grid">{Array.from({length:Math.max(count,jobs.length)},(_,i)=>{const slot=i+1,job=jobs.find(j=>j.slot===slot),url=job?.outputImages[0];return <ResultCard key={`tryon-candidate-slot-${slot}`} job={job} label={`候选 ${String(slot).padStart(2,"0")}`} selected={selected===url} onSelect={url?()=>setSelected(url):undefined} onPreview={url?()=>setPreview({images:allImages,index:allImages.indexOf(url)}):undefined} onRetry={()=>run(()=>start(slot))} onFallbackRetry={route.fallback.configured?()=>run(()=>start(slot,"fallback")):undefined}/>})}</div>:<div className="empty-state">
<div>
<div className="empty-icon">◇</div>
<b>还没有换装候选</b>
<p>上传两张输入图片后即可开始换装。</p>
</div>
</div>}<div className="confirm-block">
<button className="primary" disabled={!canConfirmSelected} onClick={()=>run(()=>confirmFlow("tryon",[selected]))}>✓ 确认选中的换装结果</button>
<p>确认后可进入三种姿势</p>
</div>
</section>
    <section className="card workbench-panel settings-panel">
<div className="panel-head">
<h2>生成设置</h2>
<small>真实模型状态</small>
</div>
<h3>生成模式</h3>
<div className="mode-grid">{TRYON_MODE_OPTIONS.map(option=>{
const sub=option.id==="quality"?(routed?route.primary.model:health.tryonProvider==="custom"?"自定义模型":"FASHN Try-On Max"):standardProvider;
return <button key={`tryon-mode-${option.id}`} className={`mode-card ${mode===option.id?"active":""}`} onClick={()=>setMode(option.id)}>
<b>{option.label}</b>
<small>{sub}</small>{option.id==="quality"&&!routed&&health.tryonProvider!=="custom"&&!health.fashn&&<em>未配置</em>}</button>})}</div>
<h3 className="section-label">候选数量</h3>
<div className="segment">
<button className={count===1?"active":""} onClick={()=>setCount(1)}>生成1张</button>
<button className={count===2?"active":""} onClick={()=>setCount(2)}>生成2张</button>
</div>
<h3 className="section-label">人物显示</h3>
<label className="check-item face-visibility-toggle"><input type="checkbox" checked={face} onChange={event=>setFace(event.target.checked)}/>露出脸部</label>
<small className="setting-help">{face?"已开启：允许露出并保持原模特脸部。":"默认关闭：生成结果不得露出或补画脸部。"}</small>
<h3 className="section-label">细节保护</h3>
<div className="protection-grid">{TRYON_PROTECTION_OPTIONS.map(option=>
<label className="check-item" key={`tryon-protection-${option.id}`}>
<input type="checkbox" checked={protectedItems.includes(option.label)} onChange={()=>setProtected(value=>value.includes(option.label)?value.filter(item=>item!==option.label):[...value,option.label])}/>{option.label}</label>)}</div>
<details className="structure-prompt-preview"><summary>查看自动组成的商品结构保护提示</summary><pre>{structurePrompt}</pre></details>
<div className="model-card">
<div className="model-row">
<span>{modelName}</span>
<span className={`badge ${configured?"success":"failed"}`}>{configured?"可用":"未配置"}</span>
</div><small>提供商：{route.primary.providerName}</small><small>备用模型：{route.fallback.configured?`${route.fallback.providerName} / ${route.fallback.model}`:"未配置"}</small>{mode==="quality"&&!routed&&health.tryonProvider!=="custom"&&<small>精细模式使用 FASHN quality · 2K，每张候选独立生成。</small>}</div>
<div className="cost-card">{mode==="quality"&&health.tryonProvider!=="custom"?"FASHN 预计消耗：每张 4 credits":"预计费用暂不可用"}</div>
<div className="generate-footer">
<button className="primary" disabled={busy||!productType||!garment.url||!model.url||!configured} onClick={()=>run(()=>start())}>{busy?"处理中…":"▷ 开始换装"}</button>
<div className="status-line">{configured?"输入与设置会保存在当前项目":health.tryonProvider==="custom"?"请先在服务器完成自定义图像 API 配置":mode==="quality"?"请先在服务器配置 FASHN_API_KEY，配置后重启工作台":"当前模型 API 尚未配置"}</div>
</div>
</section>
  </div>{preview&&<ImagePreviewDialog {...preview} onClose={()=>setPreview(null)}/>}</>;
}
