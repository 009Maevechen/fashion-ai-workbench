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
import ReferenceColorSampler from "./ReferenceColorSampler";
import {hasClearableSourceAssets} from "@/lib/asset-cleanup";
import {hasWorkflowResults} from "@/lib/result-cleanup";
import {colorResultCount,colorSetIssue,duplicateColorNames,expectedColorResultCount,normalizedColorName} from "@/lib/color-sets";
import {colorDistance} from "@/lib/color-palette";

const PROTECTED=["白色包边","黑色包边","印花","图案","纽扣","拉链","腰带","口袋","模特皮肤","头发","鞋子","背景","服装结构","服装纹理和褶皱"];
const EXTRA="只修改服装主体面料颜色，保护区域、模特和背景不得改变。";
const VALID_HEX=/^#[0-9A-Fa-f]{6}$/;

export default function RecolorPanel({p,jobs,health,modelRouting,busy,run,persistAsset,deleteAsset,clearSourceAssets,clearWorkflowResults,saveProject,post}:PanelProps){
  const saved=p.settings.recolor;
  const [sourceMode,setSourceMode]=useState<"confirmed"|"standalone">(saved?.sourceMode||((p.confirmedPoseImages?.length||0)>=2?"confirmed":"standalone"));
  const [manual,setManual]=useState<LocalAsset[]>((p.assets.standaloneRecolorPoseImages||[]).map((url,i)=>({url,name:`独立姿势${i+1}`,status:"saved"})));
  const [reference,setReference]=useState<LocalAsset>({url:p.assets.colorReferenceImage,name:"多颜色参考图",status:p.assets.colorReferenceImage?"saved":"idle"});
  const [colors,setColors]=useState<TargetColor[]>(p.targetColors||[]);
  const [activeId,setActiveId]=useState(saved?.activeColorId||p.targetColors?.[0]?.id||"");
  const [mode,setMode]=useState<"fast"|"standard"|"quality">(saved?.mode||"standard");
  const [face,setFace]=useState(saved?.face??false);
  const [area,setArea]=useState(saved?.garmentArea||"整套服装");
  const [protectedAreas,setProtected]=useState(saved?.protectedAreas?.length?saved.protectedAreas:PROTECTED);
  const [extra,setExtra]=useState(saved?.extraRequirements||EXTRA);
  const [batchColorIds,setBatchColorIds]=useState<string[]>((p.targetColors||[]).map(color=>color.id));
  const [analyzing,setAnalyzing]=useState(false);
  const [preview,setPreview]=useState<{images:string[];index:number}|null>(null);
  useEffect(()=>setColors(p.targetColors||[]),[p.targetColors]);
  const active=colors.find(c=>c.id===activeId);
  const duplicateNames=duplicateColorNames(colors),activeName=active?normalizedColorName(active):"",activeNameDuplicate=Boolean(activeName&&duplicateNames.has(activeName.toLocaleLowerCase()));
  const generatedColors=colors.filter(color=>color.poseResults?.some(Boolean)).length;
  const hasTargetColor=(color?:TargetColor)=>Boolean(reference.url||color?.cropImage||VALID_HEX.test(color?.hex||""));
  const sources=sourceMode==="confirmed"?(p.confirmedPoseImages||[]):manual.map(x=>x.url).filter(Boolean) as string[];
  const expectedCount=active?.sourceCount===2?2:active?.sourceCount===3?3:sources.length>=2&&sources.length<=3?sources.length:3;
  const colorJobs=jobs.filter(j=>j.targetColorId===activeId);
  const route=modelRouting.recolor,routed=route.primary.source==="stored";
  const configured=routed?route.primary.configured:health.recolorProvider==="custom"?health.custom:health.recolorProvider==="volcengine"?health.volcengine:mode==="quality"?health.fluxPro:health.volcengine;
  const modelLabel=routed?route.primary.model:health.recolorProvider==="custom"?"自定义模型":health.recolorProvider==="volcengine"?"Seedream 5.0":"FLUX Pro";

  async function persist(asset:LocalAsset,key:"colorReferenceImage"|"standaloneRecolorPoseImages",name:string,index?:number){
    if(key==="colorReferenceImage")setReference({...asset,status:"uploading"});else setManual(v=>{const next=[...v];next[index!]={...asset,status:"uploading"};return next});
    const url=await persistAsset(asset.file,key,name,index);
    if(key==="colorReferenceImage"){setReference({...asset,url,file:undefined,status:"saved"});if(colors.length===0)await analyzeReference(false)}else setManual(v=>{const next=[...v];next[index!]={...asset,url,file:undefined,status:"saved"};return next});
  }
  async function persistColors(next:TargetColor[],nextActive=activeId){setColors(next);await saveProject({targetColors:next,settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:nextActive,sourceMode,face}}})}
  async function clearAllAssets(){const project=await clearSourceAssets();setReference({status:"idle"});setManual([]);setColors(project.targetColors||[]);setPreview(null)}
  async function clearResults(){const project=await clearWorkflowResults("recolor");setColors(project.targetColors||[]);setPreview(null)}
  async function addColor(){const color:TargetColor={id:crypto.randomUUID(),name:"",status:"draft"},next=[...colors,color];setActiveId(color.id);setBatchColorIds(ids=>[...ids,color.id]);await persistColors(next,color.id)}
  async function updateColor(patch:Partial<TargetColor>){if(!active)return;await persistColors(colors.map(c=>c.id===active.id?{...c,...patch}:c))}
  async function updateColorById(id:string,patch:Partial<TargetColor>){await persistColors(colors.map(color=>color.id===id?{...color,...patch}:color),id)}
  async function analyzeReference(confirmReplace=true){
    if(confirmReplace&&colors.some(color=>color.poseResults?.length)&&!confirm("重新分析不会删除已生成结果，只会补充新的候选颜色。是否继续？"))return;
    setAnalyzing(true);
    try{
      const response=await fetch(`/api/projects/${p.id}/colors/analyze`,{method:"POST"}),data=await response.json() as {colors?:Array<{name:string;hex:string}>;error?:string};
      if(!response.ok||!data.colors)throw new Error(data.error||"颜色分析失败");
      // 尚未生成结果时，重新分析应替换旧的误识别色卡；已有结果时只补充新候选，避免误删产物。
      const hasGeneratedColors=colors.some(color=>color.poseResults?.length);
      const existingHex=hasGeneratedColors?colors.map(color=>(color.hex||"").toUpperCase()).filter(Boolean):[];
      const additions=data.colors.filter(color=>existingHex.every(hex=>colorDistance(hex,color.hex)>7)).map(color=>({id:crypto.randomUUID(),name:color.name,baseHex:color.hex,hex:color.hex,status:"ready" as const}));
      const next=colors.length&&confirmReplace&&hasGeneratedColors?[...colors,...additions].slice(0,5):additions;
      if(!next.length)throw new Error("参考图中的颜色已经全部存在");
      const nextActive=activeId&&next.some(color=>color.id===activeId)?activeId:next[0].id;
      setBatchColorIds(next.map(color=>color.id));setActiveId(nextActive);await persistColors(next,nextActive);
    }finally{setAnalyzing(false)}
  }
  async function addSampledColor(sample:{name:string;hex:string}){
    if(colors.some(color=>color.hex&&colorDistance(color.hex,sample.hex)<10))throw new Error("这个色块与已有色卡非常接近，请点击另一件衣服的主体区域");
    const color:TargetColor={id:crypto.randomUUID(),name:sample.name,baseHex:sample.hex,hex:sample.hex,status:"ready"},next=[...colors,color];
    setActiveId(color.id);setBatchColorIds(ids=>[...ids,color.id]);await persistColors(next,color.id);
  }
  async function applyColorAdjustment(patch:Pick<TargetColor,"baseHex"|"hex"|"colorAdjustment">){
    if(!active)return;
    const changed=active.hex!==patch.hex,hasOldResults=Boolean(active.poseResults?.length),stale=changed&&hasOldResults;
    const next=colors.map(color=>color.id===active.id?{...color,...patch,status:stale?"stale" as const:hasOldResults?color.status:"ready" as const}:color);
    setColors(next);
    await saveProject({targetColors:next,settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:active.id,sourceMode,face}},...(stale?{status:"需要重新审核",dependencyStatus:"needs_review",stepStatuses:{...p.stepStatuses,"4":"stale","5":"stale"}}:{})});
  }
  async function crop(region:CropRegion){if(!active)return;const result=await post(`/api/projects/${p.id}/colors/crop`,{colorId:active.id,region}) as {url:string};await updateColor({cropRegion:region,cropImage:result.url,status:"ready"})}
  async function submitColor(target:TargetColor,slot?:number,modelPreference:"primary"|"fallback"="primary"){
    const colorName=normalizedColorName(target);
    if(!colorName)throw new Error("请先为每一款颜色命名，例如黑色、米白色或卡其色");
    if(duplicateNames.has(colorName.toLocaleLowerCase()))throw new Error("颜色名称不能重复，请为每一款颜色填写不同名称");
    if(sources.length<2||sources.length>3)throw new Error("必须有两张或三张有效姿势输入图");
    if(!hasTargetColor(target))throw new Error(`“${colorName}”缺少参考图或有效HEX色值`);
    await post("/api/recolor",{projectId:p.id,...(reference.url?{colorReferenceImage:reference.url}:{}),...(target.cropImage?{colorReferenceCrop:target.cropImage}:{}),targetColorId:target.id,colorName,hexColor:target.hex||"",garmentArea:area,protectedAreas,extraRequirements:extra,face,mode,sourceMode,poseImages:sources,modelPreference,...(slot?{slot}:{})});
  }
  async function startColor(target:TargetColor,slot?:number,modelPreference:"primary"|"fallback"="primary"){
    await saveProject({settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:target.id,sourceMode,face}},targetColors:colors});
    await submitColor(target,slot,modelPreference);
  }
  async function start(slot?:number,modelPreference:"primary"|"fallback"="primary"){if(!active)throw new Error("请先添加一个目标颜色");await startColor(active,slot,modelPreference)}
  async function startBatch(){
    const targets=colors.filter(color=>batchColorIds.includes(color.id));
    if(!targets.length)throw new Error("请至少勾选一款需要复色的颜色");
    if(!configured)throw new Error("当前复色模型尚未配置");
    const first=targets[0];setActiveId(first.id);
    await saveProject({settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:first.id,sourceMode,face}},targetColors:colors});
    // 同一批次的所有颜色同时提交，各颜色仍保留独立任务和独立输出目录。
    const results=await Promise.allSettled(targets.map(color=>submitColor(color)));
    const failed=results.flatMap((result,index)=>result.status==="rejected"?[`${normalizedColorName(targets[index])}：${result.reason instanceof Error?result.reason.message:"提交失败"}`]:[]);
    if(failed.length)throw new Error(`部分颜色提交失败（${failed.length}/${targets.length}）：${failed.join("；")}`);
  }
  async function removeManual(index:number){await deleteAsset("standaloneRecolorPoseImages",index);setManual(v=>{const next=[...v];next[index]={status:"idle"};return next})}
  async function removeColor(target=active){if(!target||!confirm(`确认删除“${target.name}”颜色套装并将对应图片移入回收站？`))return;const response=await fetch(`/api/projects/${p.id}/colors/${target.id}`,{method:"DELETE"}),data=await response.json();if(!response.ok)throw new Error(data.error);const next=data.targetColors as TargetColor[];setColors(next);setBatchColorIds(ids=>ids.filter(id=>id!==target.id));setActiveId(next[0]?.id||"")}
  async function removeCollectionImage(color:TargetColor,url:string){
    if(!confirm(`确认从“${normalizedColorName(color)||"未命名颜色"}”集合中删除这张图片？\n其他复色结果会保留。`))return;
    const response=await fetch(`/api/projects/${p.id}/colors/${color.id}/images`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})}),data=await response.json();
    if(!response.ok)throw new Error(data.error||"删除图片失败");
    const next=data.targetColors as TargetColor[];setColors(next);if(preview?.images.includes(url))setPreview(null);
  }
  function nextColor(){const index=colors.findIndex(c=>c.id===activeId),next=colors[index+1];if(next)setActiveId(next.id)}

  const selectedBatchColors=colors.filter(color=>batchColorIds.includes(color.id));
  const resultColors=colors.filter(color=>Boolean(color.poseResults?.length)||jobs.some(job=>job.targetColorId===color.id));
  const collectionItems=colors.flatMap(color=>(color.poseResults||[]).filter(Boolean).map((url,index)=>({color,url,index})));
  const collectionImages=collectionItems.map(item=>item.url);
  const colorControlPanel=<section className="card recolor-control-card">
    <div className="panel-head"><div><h2>当前颜色与生成设置</h2><small>{activeName||"请选择颜色"}</small></div>{active&&<button className="secondary" type="button" onClick={nextColor} disabled={!colors[colors.findIndex(color=>color.id===activeId)+1]}>下一个颜色</button>}</div>
    {active?<><ColorAdjustmentPanel key={active.id} baseHex={active.baseHex||active.hex} adjustment={active.colorAdjustment} disabled={busy} onApply={applyColorAdjustment}/>{reference.url&&<details className="recolor-crop-details"><summary>从参考图精确框选当前颜色</summary><ColorCropper src={reference.url} region={active.cropRegion} onChange={region=>run(()=>crop(region))}/></details>}</>:<div className="notice">请先在左侧取色并添加色卡，或从色卡列表选择“配置色差”。</div>}
    <div className="settings-divider"/><h3>生成模式</h3><div className="mode-grid">{[["fast","快速",modelLabel],["standard","标准",modelLabel],["quality","精细",modelLabel]].map(([key,title,model])=><button className={`mode-card ${mode===key?"active":""}`} key={key} onClick={()=>setMode(key as typeof mode)}><b>{title}</b><small>{model}</small></button>)}</div>
    <label className="field">复色区域<select value={area} onChange={event=>setArea(event.target.value)}><option>上衣</option><option>裤子</option><option>裙子</option><option>整套服装</option></select></label>
    <h3 className="section-label">人物显示</h3><label className="check-item face-visibility-toggle"><input type="checkbox" checked={face} onChange={event=>setFace(event.target.checked)}/>露出脸部</label><small className="setting-help">{face?"已开启：允许露出并保持原模特脸部。":"默认关闭：复色结果不得露出或补画脸部。"}</small>
    <h3 className="section-label">保护区域</h3><div className="protection-grid">{PROTECTED.map(item=><label className="check-item" key={item}><input type="checkbox" checked={protectedAreas.includes(item)} onChange={()=>setProtected(value=>value.includes(item)?value.filter(current=>current!==item):[...value,item])}/>{item}</label>)}</div>
    <label className="field">补充要求<textarea value={extra} onChange={event=>setExtra(event.target.value)}/></label>
    <div className="model-card"><div className="model-row"><span>{routed?route.primary.model:health.recolorProvider==="volcengine"?"Doubao Seedream 5.0":mode==="quality"?"FLUX.2 Pro":"Seedream 5.0"}</span><span className={`badge ${configured?"success":"failed"}`}>{configured?"可用":"未配置"}</span></div><small>提供商：{route.primary.providerName}</small><small>备用模型：{route.fallback.configured?`${route.fallback.providerName} / ${route.fallback.model}`:"未配置"}</small></div>
    <div className="generate-footer"><button className="primary" disabled={busy||!active||!activeName||activeNameDuplicate||sources.length<2||sources.length>3||!hasTargetColor(active)||!configured} onClick={()=>run(()=>start())}>单独重试{activeName||"当前颜色"}（{sources.length>=2?sources.length:"2–3"}张）</button></div>
  </section>;
  return <>
    <section className="card recolor-flow-card">
      <div className="recolor-flow-title">
        <div><span className="recolor-step-pill">步骤 4 · 色卡复色</span><h2>上传色卡并批量生成复色图</h2><p>模特原图保持人物与构图不变；颜色参考图用于提取商品色卡，每个颜色分别生成一套结果。</p></div>
        <div className="panel-actions"><span className={`badge ${generatedColors>0?"success":"wait"}`}>{generatedColors}/{colors.length} 款已有结果</span><ClearAssetsButton disabled={busy||!hasClearableSourceAssets(p)} onConfirm={clearAllAssets}/></div>
      </div>
      <label className="field recolor-sku-field">商品货号（作为输出文件夹名称）<input value={p.sku} readOnly/><small>货号来自当前商品项目，输出将保存到 outputs/{p.sku}/recolor/颜色名称/。</small></label>

      <div className="recolor-section-title"><div><h3>模特原图（2–3张）</h3><small>支持使用已确认姿势，也可以独立上传；一款颜色会生成同样数量的结果图。</small></div><div className="segment compact"><button className={sourceMode==="confirmed"?"active":""} disabled={(p.confirmedPoseImages?.length||0)<2} onClick={()=>setSourceMode("confirmed")}>已确认姿势</button><button className={sourceMode==="standalone"?"active":""} onClick={()=>setSourceMode("standalone")}>独立上传</button></div></div>
      {sourceMode==="confirmed"
        ?<div className="recolor-source-gallery">{sources.map((url,index)=><button className="recolor-source-tile" type="button" key={url} onClick={()=>setPreview({images:sources,index})}><span>复色专用</span><img src={url} alt={`模特原图${index+1}`}/><small>姿势 {index+1} · 查看大图</small></button>)}</div>
        :<div className="recolor-upload-gallery">{[0,1,2].map(index=><AssetUploadCard key={index} label={`模特图 ${index+1}${index===2?"（可选）":""}`} value={manual[index]||{status:"idle"}} onChange={asset=>run(()=>persist(asset,"standaloneRecolorPoseImages",`recolor-pose-${index+1}`,index))} onDelete={()=>run(()=>removeManual(index))} onPreview={()=>manual[index]?.url&&setPreview({images:sources,index})}/>)}</div>}

      <div className="recolor-section-title"><div><h3>颜色参考图（产品平铺图，展示所有颜色）</h3><small>上传后自动提取主要颜色；识别结果必须由人工核对并命名。</small></div></div>
      <div className="recolor-reference-layout">
        <div className="recolor-reference-upload"><AssetUploadCard label="颜色参考图" description="建议上传同款多色平铺图，点击、拖拽或粘贴图片" value={reference} onChange={asset=>run(()=>persist(asset,"colorReferenceImage","color-reference"))} onDelete={()=>run(async()=>{await deleteAsset("colorReferenceImage");setReference({status:"idle"})})} onPreview={()=>reference.url&&setPreview({images:[reference.url],index:0})}/></div>
        <div className="recolor-reference-note"><b>识别原则</b><span>只提取颜色，不复制参考图中的款式、图案、结构和模特。</span><span>颜色名称和HEX可以手动修改，避免相近颜色混淆。</span><span>生成时，每个颜色都会建立独立任务与独立文件夹。</span></div>
      </div>
      {reference.url&&<div className="recolor-sampler-settings-grid">
        <div className="recolor-sampler-left">
          <ReferenceColorSampler src={reference.url} existingNames={colors.map(color=>color.name)} disabled={busy} extracting={analyzing} onExtractAll={()=>run(()=>analyzeReference())} onAdd={addSampledColor}/>
          <section className="card recolor-analysis-card">
            <div className="panel-head"><div><h2>颜色识别与色卡管理</h2><small>服装类型：{p.productType} {p.profile?.attributes?.fit?`· 版型：${p.profile.attributes.fit}`:""}</small></div><div className="panel-actions"><button type="button" className="secondary" disabled={!reference.url||analyzing||busy} onClick={()=>run(()=>analyzeReference())}>{analyzing?"正在分析":"重新分析颜色"}</button><button type="button" className="secondary" onClick={()=>run(addColor)}>＋ 手动添加颜色</button></div></div>
            {colors.length?<div className="recolor-color-editor-list">{colors.map((color,index)=>{const count=colorResultCount(color),issue=count?`已收集 ${count} 张`:colorSetIssue(color,duplicateNames),required=expectedColorResultCount(color),checked=batchColorIds.includes(color.id);return <div className={`recolor-color-editor ${color.id===activeId?"active":""}`} key={color.id}>
              <label className="recolor-batch-check"><input type="checkbox" checked={checked} onChange={()=>setBatchColorIds(ids=>checked?ids.filter(id=>id!==color.id):[...ids,color.id])}/></label>
              <input className="recolor-swatch-input" type="color" value={VALID_HEX.test(color.hex||"")?color.hex:"#C8A06A"} onChange={event=>run(()=>updateColorById(color.id,{baseHex:event.target.value.toUpperCase(),hex:event.target.value.toUpperCase(),status:color.poseResults?.length?"stale":"ready"}))}/>
              <div className="recolor-color-fields"><label>颜色名称<input defaultValue={color.name} placeholder={`颜色 ${index+1}`} onBlur={event=>run(()=>updateColorById(color.id,{name:event.target.value}))}/></label><label>HEX色值<input defaultValue={color.hex||""} placeholder="#C8A06A" onBlur={event=>run(()=>updateColorById(color.id,{baseHex:event.target.value.toUpperCase(),hex:event.target.value.toUpperCase()}))}/></label></div>
              <div className="recolor-color-status"><b>{colorResultCount(color)}/{required} 张</b><small>{issue}</small></div>
              <button type="button" className="secondary" onClick={()=>setActiveId(color.id)}>配置色差</button>
              <button type="button" className="danger" onClick={()=>run(()=>removeColor(color))}>删除</button>
            </div>})}</div>:<div className="empty-state compact-empty">上传颜色参考图后会自动建立色卡；也可以手动添加颜色。</div>}
            {duplicateNames.size>0&&<div className="error">存在重复颜色名称，请分别命名后再批量复色。</div>}
            <div className="recolor-batch-bar"><div><b>已选择 {selectedBatchColors.length} 款颜色</b><span>预计生成 {selectedBatchColors.length*(sources.length>=2?sources.length:0)} 张图片</span></div><button className="primary" disabled={busy||!configured||sources.length<2||sources.length>3||selectedBatchColors.length===0||duplicateNames.size>0||selectedBatchColors.some(color=>!normalizedColorName(color)||!hasTargetColor(color))} onClick={()=>run(startBatch)}>开始批量复色</button></div>
          </section>
        </div>
        {colorControlPanel}
      </div>}
    </section>

    <div className="recolor-production-grid">
      <section className="card recolor-results-card">
        <div className="panel-head"><div><h2>{active?`${activeName||"未命名颜色"} · 生成结果`:"复色生成结果"}</h2><small>生成成功的图片会自动进入右侧集合，不再需要确认颜色</small></div><div className="panel-actions"><span className="badge">{active?.status||"未建立颜色"}</span><ClearResultsButton workflow="recolor" disabled={busy||!hasWorkflowResults(p,jobs,"recolor")} onConfirm={clearResults}/></div></div>
        {resultColors.length>0&&<div className="recolor-result-tabs">{resultColors.map(color=>{const liveJobs=jobs.filter(job=>job.targetColorId===color.id),liveCount=new Set(liveJobs.flatMap(job=>job.outputImages)).size,done=Math.max(colorResultCount(color),liveCount),required=expectedColorResultCount(color),running=liveJobs.some(job=>["queued","submitting","waiting_provider","downloading","validating","saving","generating"].includes(job.status));return <button type="button" className={color.id===activeId?"active":""} key={color.id} onClick={()=>setActiveId(color.id)}><i style={{background:VALID_HEX.test(color.hex||"")?color.hex:"#E8E8EE"}}/><span>{normalizedColorName(color)||"未命名颜色"}</span><small>{running?"生成中":`${done}/${required}张`}</small></button>})}</div>}
        {active?<div className={`result-grid ${expectedCount===3?"three":""}`}>{Array.from({length:expectedCount},(_,index)=>index+1).map(slot=>{const job=colorJobs.find(item=>item.slot===slot),url=job?.outputImages[0];return <div className="recolor-result-pair" key={slot}><div><small>复色前 · 姿势{slot}</small>{sources[slot-1]?<img className="result-image before-thumb" src={sources[slot-1]} alt="复色前"/>:<div className="result-placeholder">缺少姿势图</div>}</div><ResultCard job={job} label={`复色后 · 姿势${slot}`} onPreview={url?()=>setPreview({images:collectionImages,index:Math.max(0,collectionImages.indexOf(url))}):undefined} onRetry={()=>run(()=>start(slot))} onFallbackRetry={route.fallback.configured?()=>run(()=>start(slot,"fallback")):undefined}/></div>})}</div>:<div className="empty-state">请先识别或添加颜色</div>}
        <div className="notice">生成图已自动保存并收集。请人工检查颜色、背景、包边、印花纽扣、模特姿势和服装结构；不满意的图片可在右侧集合中单独删除。</div>
      </section>
      <aside className="card recolor-collection-card"><div className="panel-head"><div><h2>已生成复色集合</h2><small>当前货号 {p.sku}</small></div><span className={`badge ${collectionItems.length?"success":"wait"}`}>{collectionItems.length} 张</span></div>{collectionItems.length?<div className="recolor-collection-grid">{collectionItems.map(({color,url,index},collectionIndex)=><article className="recolor-collection-item" key={`${color.id}:${url}`}><button className="image-button" type="button" onClick={()=>setPreview({images:collectionImages,index:collectionIndex})}><img src={url} alt={`${normalizedColorName(color)||"未命名颜色"}姿势${index+1}`}/></button><div className="recolor-collection-meta"><i style={{background:VALID_HEX.test(color.hex||"")?color.hex:"#E8E8EE"}}/><div><b>{normalizedColorName(color)||"未命名颜色"}</b><small>姿势 {index+1}</small></div></div><div className="recolor-collection-actions"><a href={url} download>下载</a><button type="button" onClick={()=>run(()=>removeCollectionImage(color,url))}>删除</button></div></article>)}</div>:<div className="empty-state compact-empty">生成成功的复色图会自动出现在这里。</div>}</aside>
    </div>
    {preview&&<ImagePreviewDialog {...preview} onClose={()=>setPreview(null)}/>}
  </>;
}
