"use client";

import {useEffect,useState} from "react";
import type {TargetColor} from "@/lib/db";
import type {PanelProps} from "./types";
import AssetUploadCard,{type LocalAsset} from "./AssetUploadCard";
import ResultCard from "./ResultCard";
import ImagePreviewDialog from "./ImagePreviewDialog";
import ColorCropper,{type CropRegion} from "./ColorCropper";
import ClearAssetsButton from "./ClearAssetsButton";
import ClearResultsButton from "./ClearResultsButton";
import ColorAdjustmentPanel from "./ColorAdjustmentPanel";
import {hasClearableSourceAssets} from "@/lib/asset-cleanup";
import {hasWorkflowResults} from "@/lib/result-cleanup";
import {colorResultCount,colorSetIssue,duplicateColorNames,isColorSetComplete,normalizedColorName} from "@/lib/color-sets";

const PROTECTED=["白色包边","黑色包边","印花","图案","纽扣","拉链","腰带","口袋","模特皮肤","头发","鞋子","背景","服装结构","服装纹理和褶皱"];
const EXTRA="只修改服装主体面料颜色，保护区域、模特和背景不得改变。";
const VALID_HEX=/^#[0-9A-Fa-f]{6}$/;

export default function RecolorPanel({p,jobs,health,modelRouting,busy,run,persistAsset,deleteAsset,clearSourceAssets,clearWorkflowResults,saveProject,post,confirmFlow}:PanelProps){
  const saved=p.settings.recolor;
  const [sourceMode,setSourceMode]=useState<"confirmed"|"standalone">(saved?.sourceMode||(p.confirmedPoseImages?.length===3?"confirmed":"standalone"));
  const [manual,setManual]=useState<LocalAsset[]>((p.assets.standaloneRecolorPoseImages||[]).map((url,i)=>({url,name:`独立姿势${i+1}`,status:"saved"})));
  const [reference,setReference]=useState<LocalAsset>({url:p.assets.colorReferenceImage,name:"多颜色参考图",status:p.assets.colorReferenceImage?"saved":"idle"});
  const [colors,setColors]=useState<TargetColor[]>(p.targetColors||[]);
  const [activeId,setActiveId]=useState(saved?.activeColorId||p.targetColors?.[0]?.id||"");
  const [mode,setMode]=useState<"fast"|"standard"|"quality">(saved?.mode||"standard");
  const [area,setArea]=useState(saved?.garmentArea||"整套服装");
  const [protectedAreas,setProtected]=useState(saved?.protectedAreas?.length?saved.protectedAreas:PROTECTED);
  const [extra,setExtra]=useState(saved?.extraRequirements||EXTRA);
  const [selected,setSelected]=useState<string[]>([]);
  const [preview,setPreview]=useState<{images:string[];index:number}|null>(null);
  useEffect(()=>setColors(p.targetColors||[]),[p.targetColors]);
  const active=colors.find(c=>c.id===activeId);
  const duplicateNames=duplicateColorNames(colors),activeName=active?normalizedColorName(active):"",activeNameDuplicate=Boolean(activeName&&duplicateNames.has(activeName.toLocaleLowerCase()));
  const completedColors=colors.filter(isColorSetComplete).length;
  const hasTargetColor=Boolean(reference.url||active?.cropImage||VALID_HEX.test(active?.hex||""));
  const sources=sourceMode==="confirmed"?(p.confirmedPoseImages||[]):manual.map(x=>x.url).filter(Boolean) as string[];
  const colorJobs=jobs.filter(j=>j.targetColorId===activeId),images=colorJobs.flatMap(j=>j.outputImages);
  const route=modelRouting.recolor,routed=route.primary.source==="stored";
  const configured=routed?route.primary.configured:health.recolorProvider==="custom"?health.custom:health.recolorProvider==="volcengine"?health.volcengine:mode==="quality"?health.fluxPro:health.volcengine;
  const modelLabel=routed?route.primary.model:health.recolorProvider==="custom"?"自定义模型":health.recolorProvider==="volcengine"?"Seedream 5.0":"FLUX Pro";

  async function persist(asset:LocalAsset,key:"colorReferenceImage"|"standaloneRecolorPoseImages",name:string,index?:number){
    if(key==="colorReferenceImage")setReference({...asset,status:"uploading"});else setManual(v=>{const next=[...v];next[index!]={...asset,status:"uploading"};return next});
    const url=await persistAsset(asset.file,key,name,index);
    if(key==="colorReferenceImage")setReference({...asset,url,file:undefined,status:"saved"});else setManual(v=>{const next=[...v];next[index!]={...asset,url,file:undefined,status:"saved"};return next});
  }
  async function persistColors(next:TargetColor[],nextActive=activeId){setColors(next);await saveProject({targetColors:next,settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:nextActive,sourceMode}}})}
  async function clearAllAssets(){const project=await clearSourceAssets();setReference({status:"idle"});setManual([]);setColors(project.targetColors||[]);setPreview(null)}
  async function clearResults(){const project=await clearWorkflowResults("recolor");setColors(project.targetColors||[]);setSelected([]);setPreview(null)}
  async function addColor(){const color:TargetColor={id:crypto.randomUUID(),name:"",status:"draft"},next=[...colors,color];setActiveId(color.id);setSelected([]);await persistColors(next,color.id)}
  async function updateColor(patch:Partial<TargetColor>){if(!active)return;await persistColors(colors.map(c=>c.id===active.id?{...c,...patch}:c))}
  async function applyColorAdjustment(patch:Pick<TargetColor,"baseHex"|"hex"|"colorAdjustment">){
    if(!active)return;
    const changed=active.hex!==patch.hex,hasOldResults=Boolean(active.poseResults?.length),stale=changed&&hasOldResults;
    const next=colors.map(color=>color.id===active.id?{...color,...patch,status:stale?"stale" as const:hasOldResults?color.status:"ready" as const}:color);
    setColors(next);
    await saveProject({targetColors:next,settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:active.id,sourceMode}},...(stale?{status:"需要重新审核",dependencyStatus:"needs_review",stepStatuses:{...p.stepStatuses,"4":"stale","5":"stale"}}:{})});
  }
  async function crop(region:CropRegion){if(!active)return;const result=await post(`/api/projects/${p.id}/colors/crop`,{colorId:active.id,region}) as {url:string};await updateColor({cropRegion:region,cropImage:result.url,status:"ready"})}
  async function start(slot?:number,modelPreference:"primary"|"fallback"="primary"){
    if(!active)throw new Error("请先添加一个目标颜色");
    if(!activeName)throw new Error("请先为当前颜色命名，例如黑色、米白色或卡其色");
    if(activeNameDuplicate)throw new Error("颜色名称不能重复，请为每一款颜色填写不同名称");
    if(sources.length!==3)throw new Error("必须有三张有效姿势输入图");
    if(!hasTargetColor)throw new Error("请上传颜色参考图，或通过色板/色号选择颜色");
    await saveProject({settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:active.id,sourceMode}},targetColors:colors});
    await post("/api/recolor",{projectId:p.id,...(reference.url?{colorReferenceImage:reference.url}:{}),...(active.cropImage?{colorReferenceCrop:active.cropImage}:{}),targetColorId:active.id,colorName:activeName,hexColor:active.hex||"",garmentArea:area,protectedAreas,extraRequirements:extra,mode,poseImages:sources,modelPreference,...(slot?{slot}:{})});
  }
  async function removeManual(index:number){await deleteAsset("standaloneRecolorPoseImages",index);setManual(v=>{const next=[...v];next[index]={status:"idle"};return next})}
  async function removeColor(){if(!active||!confirm(`确认删除“${active.name}”颜色套装并将对应图片移入回收站？`))return;const response=await fetch(`/api/projects/${p.id}/colors/${active.id}`,{method:"DELETE"}),data=await response.json();if(!response.ok)throw new Error(data.error);const next=data.targetColors as TargetColor[];setColors(next);setActiveId(next[0]?.id||"");setSelected([])}
  function nextColor(){const index=colors.findIndex(c=>c.id===activeId),next=colors[index+1];if(next){setActiveId(next.id);setSelected(next.poseResults||[])}}

  return <>
<section className="card color-set-overview"><div className="panel-head"><div><h2>颜色套装清单</h2><small>每一种商品颜色都必须单独命名，并完成三张姿势复色</small></div><div className="panel-actions"><span className={`badge ${colors.length>0&&completedColors===colors.length?"success":"wait"}`}>{completedColors}/{colors.length} 套完成</span><button type="button" className="secondary" onClick={()=>run(addColor)}>＋ 添加颜色</button>{active&&<button type="button" className="danger" onClick={()=>run(removeColor)}>删除当前颜色</button>}<button type="button" className="secondary" disabled={!colors[colors.findIndex(c=>c.id===activeId)+1]} onClick={nextColor}>下一个颜色</button></div></div>
{colors.length?<div className="color-set-list">{colors.map((color,index)=>{const issue=colorSetIssue(color,duplicateNames);return <button type="button" className={`${color.id===activeId?"active":""} ${issue==="已完成"?"complete":""}`} key={color.id} onClick={()=>{setActiveId(color.id);setSelected(color.poseResults||[])}}><i style={{background:VALID_HEX.test(color.hex||"")?color.hex:"#E8E8EE"}}/><span><b>{normalizedColorName(color)||`未命名颜色 ${index+1}`}</b><small>{color.hex||"尚未设置色值"} · {colorResultCount(color)}/3 张</small></span><em>{issue}</em></button>})}</div>:<div className="notice">请按照产品实际拥有的颜色逐个点击“添加目标颜色”，例如黑色、白色、卡其色；系统不会用随机颜色代替。</div>}
</section>
<div className="workbench-grid recolor-workbench">
    <section className="card">
<div className="panel-head">
<h2>复色输入</h2>
<div className="panel-actions"><span className="badge">一个颜色一套三张</span><ClearAssetsButton disabled={busy||!hasClearableSourceAssets(p)} onConfirm={clearAllAssets}/></div>
</div>
<div className="segment">
<button className={sourceMode==="confirmed"?"active":""} disabled={p.confirmedPoseImages?.length!==3} onClick={()=>setSourceMode("confirmed")}>使用已确认姿势</button>
<button className={sourceMode==="standalone"?"active":""} onClick={()=>setSourceMode("standalone")}>独立上传三张</button>
</div>{sourceMode==="confirmed"?<div className="image-grid">{sources.map(url=>
<img className="result-image" src={url} alt="已确认姿势" key={url}/>)}</div>:<div className="image-grid">{[0,1,2].map(i=>
<AssetUploadCard key={i} label={`姿势${i+1}输入图`} value={manual[i]||{status:"idle"}} onChange={asset=>run(()=>persist(asset,"standaloneRecolorPoseImages",`recolor-pose-${i+1}`,i))} onDelete={()=>run(()=>removeManual(i))} onPreview={()=>manual[i]?.url&&setPreview({images:sources,index:i})}/>)}</div>}<div className="recolor-reference-block"><AssetUploadCard label="多颜色参考图（可选）" description="只提取框选服装区域的颜色，不复制款式、图案或结构" value={reference} onChange={asset=>run(()=>persist(asset,"colorReferenceImage","color-reference"))} onDelete={()=>run(async()=>{await deleteAsset("colorReferenceImage");setReference({status:"idle"})})} onPreview={()=>reference.url&&setPreview({images:[reference.url],index:0})}/></div>{active&&reference.url&&<>
<h3 className="section-label">在参考图中框选当前颜色</h3>
<ColorCropper src={reference.url} region={active.cropRegion} onChange={region=>run(()=>crop(region))}/>
</>}</section>
    <section className="card">
<div className="panel-head">
<h2>{active?`${activeName||"未命名颜色"} · 三张一套`:"复色结果"}</h2>
<div className="panel-actions"><span className="badge">{active?.status||"未建立颜色"}</span><ClearResultsButton workflow="recolor" disabled={busy||!hasWorkflowResults(p,jobs,"recolor")} onConfirm={clearResults}/></div>
</div>{active?<div className="result-grid three">{[1,2,3].map(slot=>{const job=colorJobs.find(x=>x.slot===slot),url=job?.outputImages[0];return <div key={slot}>
<small>复色前</small>{sources[slot-1]&&<img className="result-image before-thumb" src={sources[slot-1]} alt="复色前"/>}<ResultCard job={job} label={`姿势${String(slot).padStart(2,"0")}复色后`} selected={!!url&&selected.includes(url)} onSelect={url?()=>setSelected(v=>v.includes(url)?v.filter(x=>x!==url):[...v,url]):undefined} onPreview={url?()=>setPreview({images,index:images.indexOf(url)}):undefined} onRetry={()=>run(()=>start(slot))} onFallbackRetry={route.fallback.configured?()=>run(()=>start(slot,"fallback")):undefined}/>
</div>})}</div>:<div className="empty-state">先添加一个目标颜色</div>}<div className="notice">人工审核目标颜色、背景、包边、印花纽扣、模特姿势和服装结构。</div>
<div className="confirm-block">
<button className="primary" disabled={!active||!activeName||activeNameDuplicate||selected.length!==3||busy||active.status==="stale"} onClick={()=>run(()=>confirmFlow("recolor",selected))}>确认{activeName||"当前颜色"}这一套（3张）</button>
</div>
</section>
    <section className="card settings-panel recolor-settings-panel">
<div className="panel-head">
<h2>颜色与生成设置</h2>
<small>{activeName||"请选择颜色"}</small>
</div>
{active?<><label className="field">颜色名称 *<input value={active.name} onChange={e=>void updateColor({name:e.target.value})} placeholder="例如：黑色、米白色、卡其色"/></label>{!activeName&&<div className="error">当前颜色尚未命名，命名后才能生成这一套。</div>}{activeNameDuplicate&&<div className="error">颜色名称“{activeName}”已经存在，请为每一款颜色使用不同名称。</div>}<ColorAdjustmentPanel key={active.id} baseHex={active.baseHex||active.hex} adjustment={active.colorAdjustment} disabled={busy} onApply={applyColorAdjustment}/></>:<div className="notice">请先在顶部添加并选择一个目标颜色。</div>}
<div className="settings-divider"/>
<h3>生成模式</h3>
<div className="mode-grid">{[["fast","快速",modelLabel],["standard","标准",modelLabel],["quality","精细",modelLabel]].map(([key,title,model])=>
<button className={`mode-card ${mode===key?"active":""}`} key={key} onClick={()=>setMode(key as typeof mode)}>
<b>{title}</b>
<small>{model}</small>
</button>)}</div>
<label className="field">复色区域<select value={area} onChange={e=>setArea(e.target.value)}>
<option>上衣</option>
<option>裤子</option>
<option>裙子</option>
<option>整套服装</option>
</select>
</label>
<h3 className="section-label">保护区域</h3>
<div className="protection-grid">{PROTECTED.map(x=>
<label className="check-item" key={x}>
<input type="checkbox" checked={protectedAreas.includes(x)} onChange={()=>setProtected(v=>v.includes(x)?v.filter(y=>y!==x):[...v,x])}/>{x}</label>)}</div>
<label className="field">补充要求<textarea value={extra} onChange={e=>setExtra(e.target.value)}/>
</label>
<div className="model-card">
<div className="model-row">
<span>{routed?route.primary.model:health.recolorProvider==="volcengine"?"Doubao Seedream 5.0":mode==="quality"?"FLUX.2 Pro":"Seedream 5.0"}</span>
<span className={`badge ${configured?"success":"failed"}`}>{configured?"可用":"未配置"}</span>
</div><small>提供商：{route.primary.providerName}</small><small>备用模型：{route.fallback.configured?`${route.fallback.providerName} / ${route.fallback.model}`:"未配置"}</small>
</div>
<div className="generate-footer">
<button className="primary" disabled={busy||!active||!activeName||activeNameDuplicate||sources.length!==3||!hasTargetColor||!configured} onClick={()=>run(()=>start())}>生成{activeName||"当前颜色"}这一套（3张）</button>
<div className="status-line">一次只生成当前命名颜色的三张姿势图；其他颜色需要分别建立和生成。</div>
</div>
</section>
  </div>{preview&&<ImagePreviewDialog {...preview} onClose={()=>setPreview(null)}/>}</>;
}
