"use client";

import {useEffect,useMemo,useState} from "react";
import type {Job,TargetColor} from "@/lib/db";
import type {PanelProps} from "./types";
import AssetUploadCard,{type LocalAsset} from "./AssetUploadCard";
import ResultCard from "./ResultCard";
import {useInpaint} from "./useInpaint";
import ConsistencyCheck from "./ConsistencyCheck";
import ImagePreviewDialog from "./ImagePreviewDialog";
import ColorCropper,{type CropRegion} from "./ColorCropper";
import ClearAssetsButton from "./ClearAssetsButton";
import ClearResultsButton from "./ClearResultsButton";
import ColorAdjustmentPanel from "./ColorAdjustmentPanel";
import ReferenceColorSampler from "./ReferenceColorSampler";
import {useProjectDraftAutosave} from "./useProjectDraftAutosave";
import {hasClearableSourceAssets} from "@/lib/asset-cleanup";
import {hasWorkflowResults} from "@/lib/result-cleanup";
import {analyzedColorName,colorResultCount,colorSetIssue,duplicateColorNames,expectedColorResultCount,mergeAnalyzedColorDetails,normalizedColorName,recolorColorName,recolorGenerationTrim} from "@/lib/color-sets";
import {colorDistance} from "@/lib/color-palette";
import {recolorAreaForProductType} from "@/lib/recolor-scope";
import {parseColorName} from "@/lib/color-name-semantics";

const PROTECTED=["白色包边","黑色包边","印花","图案","纽扣","拉链","腰带","口袋","模特皮肤","头发","鞋子","背景","服装结构","服装纹理和褶皱"];
const EXTRA="只修改服装主体面料颜色，保护区域、模特和背景不得改变。";
const VALID_HEX=/^#[0-9A-Fa-f]{6}$/;

export default function RecolorPanel({p,jobs,historyJobs,health,modelRouting,busy,run,refreshProject,persistAsset,deleteAsset,clearSourceAssets,clearWorkflowResults,saveProject,post,enqueue}:PanelProps&{historyJobs:Job[]}){
  const saved=p.settings.recolor;
  const lockedArea=recolorAreaForProductType(p.productType);
  const [sourceMode,setSourceMode]=useState<"confirmed"|"standalone">(saved?.sourceMode||((p.confirmedPoseImages?.length||0)>=2?"confirmed":"standalone"));
  const [manual,setManual]=useState<LocalAsset[]>((p.assets.standaloneRecolorPoseImages||[]).map((url,i)=>({url,name:`独立姿势${i+1}`,status:"saved"})));
  const [reference,setReference]=useState<LocalAsset>({url:p.assets.colorReferenceCropImage||p.assets.colorReferenceImage||p.assets.garmentImage,name:p.assets.colorReferenceCropImage?"已框选的颜色参考图":p.assets.colorReferenceImage?"多颜色参考图":"产品主图（自动作为颜色参考）",status:(p.assets.colorReferenceCropImage||p.assets.colorReferenceImage||p.assets.garmentImage)?"saved":"idle"});
  const [referenceSourceUrl,setReferenceSourceUrl]=useState(p.assets.colorReferenceImage||p.assets.garmentImage||"");
  const [referenceCropOpen,setReferenceCropOpen]=useState(false);
  const [referenceCropDraft,setReferenceCropDraft]=useState<CropRegion|undefined>(p.assets.colorReferenceCropRegion);
  const [colors,setColors]=useState<TargetColor[]>(p.targetColors||[]);
  const [activeId,setActiveId]=useState(saved?.activeColorId||p.targetColors?.[0]?.id||"");
  const [mode,setMode]=useState<"fast"|"standard"|"quality">(saved?.mode||"standard");
  const [face]=useState(saved?.face??false);
  const [area,setArea]=useState<string>(lockedArea);
  const [protectedAreas,setProtected]=useState(saved?.protectedAreas?.length?saved.protectedAreas:PROTECTED);
  const [extra,setExtra]=useState(saved?.extraRequirements||EXTRA);
  const [batchColorIds,setBatchColorIds]=useState<string[]>(saved?.selectedBatchColorIds||(p.targetColors||[]).map(color=>color.id));
  const [colorsLocked,setColorsLocked]=useState(saved?.colorsLocked??false);
  const [analyzing,setAnalyzing]=useState(false);
  const [analysisNotice,setAnalysisNotice]=useState("");
  const [paletteVisible,setPaletteVisible]=useState(false);
  const [retrySlots,setRetrySlots]=useState<number[]>([]);
  const [preview,setPreview]=useState<{images:string[];index:number}|null>(null);
  const [historyJobId,setHistoryJobId]=useState("");
  useEffect(()=>setColors(p.targetColors||[]),[p.targetColors]);
  useEffect(()=>setArea(lockedArea),[lockedArea]);
  useEffect(()=>setRetrySlots([]),[activeId]);
  const generatingKey=colors.filter(color=>color.status==="generating").map(color=>color.id).join(":");
  useEffect(()=>{
    if(!generatingKey)return;
    const timer=window.setInterval(()=>{void refreshProject()},1000);
    return ()=>window.clearInterval(timer);
  },[generatingKey,refreshProject]);
  const active=colors.find(c=>c.id===activeId);
  const duplicateNames=duplicateColorNames(colors),activeName=active?normalizedColorName(active):"",activeNameDuplicate=Boolean(activeName&&duplicateNames.has(activeName.toLocaleLowerCase()));
  const generatedColors=colors.filter(color=>color.poseResults?.some(Boolean)).length;
  const hasTargetColor=(color?:TargetColor)=>Boolean(color?.cropImage);
  const sources=sourceMode==="confirmed"?(p.confirmedPoseImages||[]):manual.map(x=>x.url).filter(Boolean) as string[];
  const expectedCount=active?.sourceCount&&active.sourceCount>=2&&active.sourceCount<=4?active.sourceCount:sources.length>=2&&sources.length<=4?sources.length:3;
  const colorJobs=jobs.filter(j=>j.targetColorId===activeId&&(!active?.generationStartedAt||j.startedAt>=active.generationStartedAt));
  const historyItems=historyJobs.filter(job=>job.outputImages[0]&&job.status!=="failed"&&job.status!=="interrupted"),historyJob=historyItems.find(job=>job.id===historyJobId);
  const route=modelRouting.recolor,routed=route.primary.source==="stored";
  const configured=routed?route.primary.configured:health.recolorProvider==="custom"?health.custom:health.recolorProvider==="volcengine"?health.volcengine:mode==="quality"?health.fluxPro:health.volcengine;
  const draftSettings=useMemo(()=>({settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:activeId,sourceMode,face,colorsLocked,selectedBatchColorIds:batchColorIds}}}),[activeId,area,batchColorIds,colorsLocked,extra,face,mode,p.settings,protectedAreas,sourceMode]);
  useProjectDraftAutosave(p.id,draftSettings);

  async function persist(asset:LocalAsset,key:"colorReferenceImage"|"standaloneRecolorPoseImages",name:string,index?:number){
    if(key==="colorReferenceImage")setReference({...asset,status:"uploading"});else setManual(v=>{const next=[...v];next[index!]={...asset,status:"uploading"};return next});
    const url=await persistAsset(asset.file,key,name,index);
    if(key==="colorReferenceImage"){
      await fetch(`/api/projects/${p.id}/colors/reference-crop`,{method:"DELETE"});
      setReference({...asset,url,file:undefined,status:"saved"});setReferenceSourceUrl(url);setReferenceCropDraft(undefined);setReferenceCropOpen(true);
    }else setManual(v=>{const next=[...v];next[index!]={...asset,url,file:undefined,status:"saved"};return next});
  }
  async function persistColors(next:TargetColor[],nextActive=activeId,nextLocked=colorsLocked){setColors(next);await saveProject({targetColors:next,settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:nextActive,sourceMode,face,colorsLocked:nextLocked}}})}
  async function clearAllAssets(){const project=await clearSourceAssets();setReference({status:"idle"});setManual([]);setColors(project.targetColors||[]);setPreview(null)}
  async function clearResults(){const project=await clearWorkflowResults("recolor");setColors(project.targetColors||[]);setHistoryJobId("");setPreview(null)}
  async function addColor(){const color:TargetColor={id:crypto.randomUUID(),name:"",status:"draft"},next=[...colors,color];setActiveId(color.id);setBatchColorIds(ids=>[...ids,color.id]);await persistColors(next,color.id)}
  async function updateColor(patch:Partial<TargetColor>){if(!active)return;await persistColors(colors.map(c=>c.id===active.id?{...c,...patch}:c))}
  async function updateColorById(id:string,patch:Partial<TargetColor>){if(colorsLocked)return;await persistColors(colors.map(color=>color.id===id?{...color,...patch}:color),id)}
  async function analyzeReference(){
    setAnalyzing(true);
    try{
      const response=await fetch(`/api/projects/${p.id}/colors/analyze`,{method:"POST"}),data=await response.json() as {colors?:Array<{name:string;hex:string;trimColorName?:string;trimHex?:string;confidence?:number;designDetails?:string[];materialFeatures?:string;cropImage?:string;cropRegion?:CropRegion}>;needsReview?:boolean;reviewReason?:string;confidence?:number;error?:string};
      if(!response.ok||!data.colors)throw new Error(data.error||"颜色分析失败");
      // 人工修改优先：已有色卡时只补充 AI 新识别到的颜色，不覆盖用户已填/已修改的颜色。
      const hasExisting=colors.length>0;
      const merged=hasExisting?mergeAnalyzedColorDetails(colors,data.colors):{colors:[],unmatched:data.colors};
      const additions=merged.unmatched.map(color=>({id:crypto.randomUUID(),name:analyzedColorName(color),baseHex:color.hex,hex:color.hex,trimColorName:color.trimColorName,trimHex:color.trimHex,designDetails:color.designDetails,materialFeatures:color.materialFeatures,designConfidence:color.confidence,designNeedsReview:(color.confidence??1)<0.65||!color.cropImage,cropImage:color.cropImage,cropRegion:color.cropRegion,status:color.cropImage?"ready" as const:"draft" as const}));
      const next=hasExisting?[...merged.colors,...additions].slice(0,6):additions;
      if(!next.length)throw new Error("参考图中的颜色已经全部存在");
      const nextActive=activeId&&next.some(color=>color.id===activeId)?activeId:next[0].id;
      setColorsLocked(false);setBatchColorIds(next.map(color=>color.id));setActiveId(nextActive);await persistColors(next,nextActive,false);
      if(data.needsReview)setAnalysisNotice(`颜色识别置信度 ${data.confidence??"?"}%：${data.reviewReason||"部分颜色需要人工确认"}，请检查并修改后再锁定。`);
      else if(data.confidence!==undefined)setAnalysisNotice(`颜色识别完成（置信度 ${data.confidence}%），请检查后锁定。`);
      else setAnalysisNotice("");
    }finally{setAnalyzing(false)}
  }
  async function saveReferenceCrop(){
    if(!referenceCropDraft)throw new Error("请先在图片上拖动框选需要识别的服装部位");
    const result=await post(`/api/projects/${p.id}/colors/reference-crop`,{region:referenceCropDraft}) as {url:string};
    setReference({url:result.url,name:"已框选的颜色参考图",status:"saved"});setReferenceCropOpen(false);
    await analyzeReference();
  }
  async function addSampledColor(sample:{name:string;hex:string}){
    if(colors.some(color=>color.hex&&colorDistance(color.hex,sample.hex)<10))throw new Error("这个色块与已有色卡非常接近，请点击另一件衣服的主体区域");
    const color:TargetColor={id:crypto.randomUUID(),name:sample.name,baseHex:sample.hex,hex:sample.hex,status:"ready"},next=[...colors,color];
    setActiveId(color.id);setBatchColorIds(ids=>[...ids,color.id]);await persistColors(next,color.id);
  }
  async function applyColorAdjustment(patch:Pick<TargetColor,"baseHex"|"hex"|"colorAdjustment">){
    if(!active||colorsLocked)return;
    const changed=active.hex!==patch.hex,hasOldResults=Boolean(active.poseResults?.length),stale=changed&&hasOldResults;
    const next=colors.map(color=>color.id===active.id?{...color,...patch,status:stale?"stale" as const:hasOldResults?color.status:"ready" as const}:color);
    setColors(next);
    await saveProject({targetColors:next,settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:active.id,sourceMode,face,colorsLocked}},...(stale?{status:"需要重新审核",dependencyStatus:"needs_review",stepStatuses:{...p.stepStatuses,"4":"stale","5":"stale"}}:{})});
  }
  async function crop(region:CropRegion){if(!active)return;const result=await post(`/api/projects/${p.id}/colors/crop`,{colorId:active.id,region}) as {url:string};await updateColor({cropRegion:region,cropImage:result.url,status:"ready"})}
  async function submitColor(target:TargetColor,slot?:number,modelPreference:"primary"|"fallback"="primary"){
    const colorName=recolorColorName(target);
    const trim=recolorGenerationTrim(target);
    if(!colorName)throw new Error("请先为每一款颜色命名，例如黑色、米白色或卡其色");
    if(duplicateNames.has(colorName.toLocaleLowerCase()))throw new Error("颜色名称不能重复，请为每一款颜色填写不同名称");
    if(sources.length<2||sources.length>4)throw new Error("必须有两张至四张有效姿势输入图（建议三至四张）");
    if(!hasTargetColor(target))throw new Error(`“${colorName}”缺少该颜色款的整件服装设计参考，请先完整框选该色款`);
    await post("/api/recolor",{projectId:p.id,...(reference.url?{colorReferenceImage:reference.url}:{}),...(target.cropImage?{colorReferenceCrop:target.cropImage}:{}),targetColorId:target.id,colorName,hexColor:target.hex||"",...trim,garmentArea:area,protectedAreas,extraRequirements:extra,face,mode,sourceMode,poseImages:sources,modelPreference,...(slot?{slot}:{})});
  }
  async function enqueueColor(target:TargetColor){
    const colorName=recolorColorName(target);
    const trim=recolorGenerationTrim(target);
    if(!colorName)throw new Error("请先为每一款颜色命名，例如黑色、米白色或卡其色");
    if(duplicateNames.has(colorName.toLocaleLowerCase()))throw new Error("颜色名称不能重复，请为每一款颜色填写不同名称");
    if(sources.length<2||sources.length>4)throw new Error("必须有两张至四张有效姿势输入图（建议三至四张）");
    if(!hasTargetColor(target))throw new Error(`“${colorName}”缺少该颜色款的整件服装设计参考，请先完整框选该色款`);
    const response=await fetch("/api/recolor",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:p.id,...(reference.url?{colorReferenceImage:reference.url}:{}),...(target.cropImage?{colorReferenceCrop:target.cropImage}:{}),targetColorId:target.id,colorName,hexColor:target.hex||"",...trim,garmentArea:area,protectedAreas,extraRequirements:extra,face,mode,sourceMode,poseImages:sources,modelPreference:"primary"})});
    const data=await response.json() as {jobId?:string;error?:string};
    if(!response.ok||!data.jobId)throw new Error(data.error||"复色任务提交失败");
    return data.jobId;
  }
  async function startColor(target:TargetColor,slot?:number,modelPreference:"primary"|"fallback"="primary"){
    await saveProject({settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:target.id,sourceMode,face,colorsLocked}},targetColors:colors});
    await submitColor(target,slot,modelPreference);
  }
  async function start(slot?:number,modelPreference:"primary"|"fallback"="primary"){if(!active)throw new Error("请先添加一个目标颜色");await startColor(active,slot,modelPreference)}
  async function retrySelected(){
    if(!active||!retrySlots.length)throw new Error("请先勾选需要重新生成的图片");
    const slots=[...retrySlots].sort((a,b)=>a-b),results=await Promise.allSettled(slots.map(slot=>start(slot)));
    const failed=results.flatMap((result,index)=>result.status==="rejected"?[`姿势${slots[index]}：${result.reason instanceof Error?result.reason.message:"提交失败"}`]:[]);
    setRetrySlots([]);
    if(failed.length)throw new Error(`部分图片重新生成提交失败：${failed.join("；")}`);
  }
  async function startBatch(){
    const targets=colors.filter(color=>batchColorIds.includes(color.id));
    if(!targets.length)throw new Error("请至少勾选一款需要复色的颜色");
    if(!colorsLocked)throw new Error("请先点击“锁定颜色”，确认每款颜色名称和整件服装设计参考后再开始复色");
    if(!configured)throw new Error("当前复色模型尚未配置");
    const first=targets[0],generationStartedAt=new Date().toISOString(),targetIds=new Set(targets.map(color=>color.id));
    const nextColors=colors.map(color=>targetIds.has(color.id)?{...color,status:"generating" as const,generationStartedAt,sourceCount:sources.length}:color);
    setRetrySlots([]);setActiveId(first.id);setColors(nextColors);
    // 先建立全新的本轮状态，旧失败任务会立即退出结果视图；网络提交在随后快速完成。
    await saveProject({status:"生成中",stepStatuses:{...p.stepStatuses,"4":"generating"},settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:first.id,sourceMode,face,colorsLocked}},targetColors:nextColors});
    const results=await Promise.allSettled(targets.map(color=>enqueueColor(color)));
    const failed=results.flatMap((result,index)=>result.status==="rejected"?[`${normalizedColorName(targets[index])}：${result.reason instanceof Error?result.reason.message:"提交失败"}`]:[]);
    if(failed.length)throw new Error(`部分颜色提交失败（${failed.length}/${targets.length}）：${failed.join("；")}`);
    void refreshProject();
  }
  async function toggleColorLock(){
    if(!colorsLocked){
      if(!colors.length)throw new Error("请先识别或手动添加颜色");
      if(duplicateNames.size)throw new Error("存在重复颜色名称，请修改后再锁定");
      if(colors.some(color=>!normalizedColorName(color)||!hasTargetColor(color)))throw new Error("请先完成每一款颜色的名称，并确认或框选该色款整件服装设计参考");
    }
    const next=!colorsLocked;setColorsLocked(next);
    await saveProject({settings:{...p.settings,recolor:{mode,garmentArea:area,protectedAreas,extraRequirements:extra,activeColorId:activeId,sourceMode,face,colorsLocked:next}},targetColors:colors});
  }
  async function removeManual(index:number){await deleteAsset("standaloneRecolorPoseImages",index);setManual(v=>{const next=[...v];next[index]={status:"idle"};return next})}
  async function removeColor(target=active){if(!target||!confirm(`确认删除“${target.name}”颜色套装并将对应图片移入回收站？`))return;const response=await fetch(`/api/projects/${p.id}/colors/${target.id}`,{method:"DELETE"}),data=await response.json();if(!response.ok)throw new Error(data.error);const next=data.targetColors as TargetColor[];setColors(next);setBatchColorIds(ids=>ids.filter(id=>id!==target.id));setActiveId(next[0]?.id||"")}
  async function removeCollectionImage(color:TargetColor,url:string){
    if(!confirm(`确认从“${normalizedColorName(color)||"未命名颜色"}”集合中删除这张图片？\n其他复色结果会保留。`))return;
    const response=await fetch(`/api/projects/${p.id}/colors/${color.id}/images`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})}),data=await response.json();
    if(!response.ok)throw new Error(data.error||"删除图片失败");
    const next=data.targetColors as TargetColor[];setColors(next);if(preview?.images.includes(url))setPreview(null);
  }
  async function checkConsistency(jobId:string){await post(`/api/projects/${p.id}/consistency-check`,{jobId})}
  async function checkActiveColorConsistency(){
    const checkable=colorJobs.filter(job=>job.outputImages[0]&&job.dependencyStatus!=="stale").sort((a,b)=>(a.slot||0)-(b.slot||0));
    if(!checkable.length)throw new Error("当前颜色没有可检测的复色结果");
    for(const job of checkable)await post(`/api/projects/${p.id}/consistency-check`,{jobId:job.id});
  }
  const selectedBatchColors=colors.filter(color=>batchColorIds.includes(color.id));
  const currentJobsFor=(color:TargetColor)=>jobs.filter(job=>job.targetColorId===color.id&&(!color.generationStartedAt||job.startedAt>=color.generationStartedAt));
  const collectionItems=colors.flatMap(color=>(color.poseResults||[]).filter(Boolean).map((url,index)=>({color,url,index})));
  const collectionImages=collectionItems.map(item=>item.url);
  const colorControlPanel=<section className={`card recolor-control-card ${paletteVisible?"palette-open":""}`}>
    <div className="panel-head"><div><h2>当前颜色调整</h2><small>{activeName||"点击色块开始调整"}</small></div><button className="settings-dialog-close compact-close" type="button" aria-label="收起色板" onClick={()=>setPaletteVisible(false)}>×</button></div>
    {active&&paletteVisible?<><ColorAdjustmentPanel key={active.id} baseHex={active.baseHex||active.hex} adjustment={active.colorAdjustment} disabled={busy} onApply={applyColorAdjustment}/>{reference.url&&<details className="recolor-crop-details"><summary>{active.cropImage?"重新框选该颜色款整件服装":"框选该颜色款整件服装（必需）"}</summary><div className="notice">请完整包含该色款可见的领口、袖口、口袋、拼接、下摆或裤脚；不能只框一个颜色小块。</div><ColorCropper src={referenceSourceUrl||reference.url} region={active.cropRegion} onChange={region=>run(()=>crop(region))}/></details>}</>:<div className="notice">点击识别出的色块或“调整颜色”，这里才会显示色板。</div>}
    <details className="recolor-advanced-details"><summary>高级生成设置</summary><label className="field">复色区域<select value={area} onChange={event=>setArea(event.target.value)}><option>上衣</option><option>裤子</option><option>裙子</option><option>整套服装</option></select></label><div className="notice recolor-face-lock-notice">人物露脸状态跟随上一流程已确认图片（有脸保留脸部，无脸不补脸），此设置不可覆盖输入图。</div><h3 className="section-label">保护区域</h3><div className="protection-grid">{PROTECTED.map(item=><label className="check-item" key={item}><input type="checkbox" checked={protectedAreas.includes(item)} onChange={()=>setProtected(value=>value.includes(item)?value.filter(current=>current!==item):[...value,item])}/>{item}</label>)}</div><label className="field">补充要求<textarea value={extra} onChange={event=>setExtra(event.target.value)}/></label></details>
    <div className="model-card"><div className="model-row"><span>{routed?route.primary.model:health.recolorProvider==="volcengine"?"Doubao Seedream 5.0":mode==="quality"?"FLUX.2 Pro":"Seedream 5.0"}</span><span className={`badge ${configured?"success":"failed"}`}>{configured?"可用":"未配置"}</span></div><small>提供商：{route.primary.providerName}</small><small>备用模型：{route.fallback.configured?`${route.fallback.providerName} / ${route.fallback.model}`:"未配置"}</small></div>
    <div className="generate-footer"><button className="primary" disabled={busy||!active||!activeName||activeNameDuplicate||sources.length<2||sources.length>4||!hasTargetColor(active)||!configured} onClick={()=>run(()=>start())}>单独重试{activeName||"当前颜色"}（{sources.length>=2?sources.length:"3–4"}张）</button></div>
  </section>;
  const inpaint=useInpaint({project:p,sourceStep:"recolor",enqueue});
  return <>
    <div className="notice" role="status">复色会保持前一步图片的原始露脸状态：有脸保留脸部，无脸不补脸，也不改变原图人物样式。</div>
    <section className="card recolor-flow-card">
      <div className="recolor-flow-title">
        <div><span className="recolor-step-pill">步骤 4 · 色卡复色</span><h2>上传色卡并批量生成复色图</h2><p>三姿势已确认图片锁定人物与构图；每个颜色款使用自己独立的整件服装参考，分别复刻颜色和对应设计。</p></div>
        <div className="panel-actions"><span className={`badge ${generatedColors>0?"success":"wait"}`}>{generatedColors}/{colors.length} 款已有结果</span><ClearAssetsButton disabled={busy||!hasClearableSourceAssets(p)} onConfirm={clearAllAssets}/></div>
      </div>
      <label className="field recolor-sku-field">商品货号（作为输出文件夹名称）<input value={p.sku} readOnly/><small>货号来自当前商品项目，输出将保存到 outputs/{p.sku}/recolor/颜色名称/。</small></label>

      <div className="recolor-source-reference-grid">
        <div className="recolor-reference-column">
          <div className="recolor-section-title"><div><h3>颜色参考图</h3><small>{p.assets.colorReferenceCropImage?"只显示已框选的服装部位":p.assets.colorReferenceImage?"上传的多颜色参考图":"已自动使用产品主图，可重新上传多颜色参考图"}</small></div></div>
          <div className="recolor-reference-upload"><AssetUploadCard label="颜色参考图" description={p.assets.colorReferenceImage?"上传后可框选服装区域":"未单独上传时自动使用产品主图识别颜色" } value={reference} onChange={asset=>run(()=>persist(asset,"colorReferenceImage","color-reference"))} onDelete={()=>run(async()=>{await fetch(`/api/projects/${p.id}/colors/reference-crop`,{method:"DELETE"});await deleteAsset("colorReferenceImage");const fallback=p.assets.garmentImage;setReference(fallback?{url:fallback,name:"产品主图（自动作为颜色参考）",status:"saved"}:{status:"idle"});setReferenceSourceUrl(fallback||"");setReferenceCropOpen(false)})} onPreview={()=>reference.url&&setPreview({images:[reference.url],index:0})}/></div>
          {referenceSourceUrl&&<button type="button" className="reference-crop-trigger" onClick={()=>setReferenceCropOpen(true)}>▣ {p.assets.colorReferenceCropImage?"重新框选识别部位":"框选识别部位"}</button>}
          <div className="recolor-reference-note"><b>识别原则</b><span>自动识别每个颜色款，并尝试为每款裁出整件服装设计参考；裁图必须包含口袋、条纹、拼接、扣子、印花、包边和面料分区。未可靠定位的色款会要求人工重新框选。</span></div>
        </div>
        <div className="recolor-source-column">
          <div className="recolor-section-title"><div><h3>复色图片（建议3–4张）</h3><small>这里只显示缩略图；点击可查看大图。</small></div><div className="segment compact"><button className={sourceMode==="confirmed"?"active":""} disabled={(p.confirmedPoseImages?.length||0)<2} onClick={()=>setSourceMode("confirmed")}>已确认姿势</button><button className={sourceMode==="standalone"?"active":""} onClick={()=>setSourceMode("standalone")}>独立上传</button></div></div>
          {sourceMode==="confirmed"
            ?<div className="recolor-source-gallery">{sources.map((url,index)=><button className="recolor-source-tile" type="button" key={url} onClick={()=>setPreview({images:sources,index})}><span>复色专用</span><img src={url} alt={`模特原图${index+1}`}/><small>姿势 {index+1} · 查看大图</small></button>)}</div>
            :<div className="recolor-upload-gallery">{[0,1,2,3].map(index=><AssetUploadCard key={index} label={`模特图 ${index+1}${index===3?"（可选）":""}`} value={manual[index]||{status:"idle"}} onChange={asset=>run(()=>persist(asset,"standaloneRecolorPoseImages",`recolor-pose-${index+1}`,index))} onDelete={()=>run(()=>removeManual(index))} onPreview={()=>manual[index]?.url&&setPreview({images:sources,index})}/>)}</div>}
        </div>
      </div>
      {referenceCropOpen&&referenceSourceUrl&&<div className="reference-crop-dialog-backdrop"><section className="reference-crop-dialog" role="dialog" aria-modal="true" aria-label="框选颜色识别部位"><div className="panel-head"><div><h2>框选需要识别的服装部位</h2><small>在图片上拖动画框，避开模特、背景、文字和其他服饰。</small></div><button type="button" className="settings-dialog-close compact-close" onClick={()=>setReferenceCropOpen(false)}>×</button></div><ColorCropper src={referenceSourceUrl} region={referenceCropDraft} onChange={setReferenceCropDraft}/><div className="reference-crop-actions"><button type="button" className="secondary" onClick={()=>setReferenceCropOpen(false)}>取消</button><button type="button" className="primary" disabled={!referenceCropDraft||busy} onClick={()=>run(saveReferenceCrop)}>保存框选并识别颜色</button></div></section></div>}
      {reference.url&&<div className="recolor-sampler-settings-grid">
        <div className="recolor-sampler-left">
          <ReferenceColorSampler src={reference.url} existingNames={colors.map(color=>color.name)} disabled={busy} extracting={analyzing} onExtractAll={()=>run(()=>analyzeReference())} onAdd={addSampledColor}/>
          <section className="card recolor-analysis-card">
            <div className="panel-head"><div><h2>颜色识别与色卡管理</h2><small>服装类型：{p.productType} {p.profile?.attributes?.fit?`· 版型：${p.profile.attributes.fit}`:""}</small></div><div className="panel-actions"><button type="button" className="recolor-analyze-button" disabled={!reference.url||analyzing||busy} onClick={()=>run(()=>analyzeReference())}>{analyzing?"正在识别…":"▶ 开始识别颜色"}</button><button type="button" className="secondary" disabled={!reference.url||analyzing||busy} onClick={()=>run(()=>analyzeReference())}>重新分析颜色</button><button type="button" className="secondary" disabled={colorsLocked} onClick={()=>run(addColor)}>＋ 手动添加颜色</button></div></div>
            {analysisNotice&&<div className="notice">{analysisNotice}</div>}
            {colors.length?<div className="recolor-color-editor-list">{colors.map((color,index)=>{const count=colorResultCount(color),issue=count?`已收集 ${count} 张`:colorSetIssue(color,duplicateNames),required=expectedColorResultCount(color),checked=batchColorIds.includes(color.id);return <div className={`recolor-color-editor ${color.id===activeId?"active":""}`} key={color.id}>
              <label className="recolor-batch-check"><input type="checkbox" checked={checked} onChange={()=>setBatchColorIds(ids=>checked?ids.filter(id=>id!==color.id):[...ids,color.id])}/></label>
              <button className="recolor-swatch-input" type="button" style={{background:VALID_HEX.test(color.hex||"")?color.hex:"#C8A06A"}} aria-label={`调整${color.name||`颜色${index+1}`}`} onClick={()=>{setActiveId(color.id);setPaletteVisible(true)}}/>
              <div className="recolor-color-fields"><label>主体颜色<input disabled={colorsLocked} defaultValue={color.name} placeholder={`颜色 ${index+1}`} onBlur={event=>run(()=>updateColorById(color.id,{name:event.target.value}))}/></label><label>主色HEX<input disabled={colorsLocked} defaultValue={color.hex||""} placeholder="#C8A06A" onBlur={event=>run(()=>updateColorById(color.id,{baseHex:event.target.value.toUpperCase(),hex:event.target.value.toUpperCase()}))}/></label><label>边饰/局部颜色<input disabled={colorsLocked} defaultValue={color.trimColorName||""} placeholder="例如：白色 / 黑色" onBlur={event=>run(()=>updateColorById(color.id,{trimColorName:event.target.value,outputName:undefined}))}/></label><label>边饰HEX<input disabled={colorsLocked} defaultValue={color.trimHex||""} placeholder="可选" onBlur={event=>run(()=>updateColorById(color.id,{trimHex:event.target.value.toUpperCase()}))}/></label><label className="recolor-output-name">颜色名称（生成规则）<input key={`${color.id}-${recolorColorName(color)}`} disabled={colorsLocked} defaultValue={recolorColorName(color)} placeholder="例如：白色黑边 / 黑色白条纹" onBlur={event=>run(()=>{const outputName=event.target.value.trim(),trim=recolorGenerationTrim({...color,outputName});return updateColorById(color.id,{outputName,...trim})})}/></label></div>
              <div className="recolor-color-status"><b>{colorResultCount(color)}/{required} 张</b><small>{issue}</small>{(()=>{const semantics=parseColorName(recolorColorName(color));return <>{semantics.parts.length>0&&<small className="recolor-semantics">{semantics.parts.map(p=>`${p.part}：${p.color}`).join("、")}</small>}{semantics.needsReview&&<small className="recolor-semantics warn">⚠ 名称结构无法可靠识别，请人工确认各部位颜色</small>}</>})()}<small title={color.designDetails?.join("、")}>{color.designDetails?.length?`设计：${color.designDetails.slice(0,3).join("、")}`:"设计：等待识别或人工框选"}</small>{color.materialFeatures&&<small title={color.materialFeatures}>面料：{color.materialFeatures}</small>}</div>
              <button type="button" className="secondary" disabled={colorsLocked} onClick={()=>{setActiveId(color.id);setPaletteVisible(true)}}>颜色与设计参考</button>
              <button type="button" className="danger" disabled={colorsLocked} onClick={()=>run(()=>removeColor(color))}>删除</button>
            </div>})}</div>:<div className="empty-state compact-empty">上传颜色参考图后会自动建立色卡；也可以手动添加颜色。</div>}
            {duplicateNames.size>0&&<div className="error">存在重复颜色名称，请分别命名后再批量复色。</div>}
            <div className="notice">复色硬规则：每个色款必须拥有自己的整件服装设计参考；同一组三姿势只替换为该色款真实可见的颜色、口袋、条纹、拼接、扣子、印花、包边、线条位置和面料分区。人物、动作、景别、构图与画面样式不得改变。</div>
            <div className="recolor-batch-bar"><div><b>已选择 {selectedBatchColors.length} 款颜色</b><span>{colorsLocked?"颜色已锁定":"请手动修改后锁定颜色"} · 预计生成 {selectedBatchColors.length*(sources.length>=2?sources.length:0)} 张图片</span></div><div className="recolor-resolution"><span>输出尺寸</span>{[["fast","1K"],["standard","2K"],["quality","4K"]].map(([key,label])=><button type="button" className={mode===key?"active":""} key={key} onClick={()=>setMode(key as typeof mode)}>{label}</button>)}</div><button type="button" className={`recolor-lock-button ${colorsLocked?"locked":""}`} disabled={busy||analyzing} onClick={()=>run(toggleColorLock)}>{colorsLocked?"解除锁定":"锁定颜色"}</button><button className="primary" disabled={busy||!colorsLocked||!configured||sources.length<2||sources.length>4||selectedBatchColors.length===0||duplicateNames.size>0||selectedBatchColors.some(color=>!normalizedColorName(color)||!hasTargetColor(color))} onClick={()=>run(startBatch)}>开始批量复色</button></div>
          </section>
        </div>
        {colorControlPanel}
      </div>}
    </section>

    <div className="recolor-production-grid">
      <section className="card recolor-results-card">
        <div className="panel-head"><div><h2>颜色任务队列</h2><small>点击颜色，下方只显示该颜色的姿势 01 / 02 / 03</small></div><div className="panel-actions recolor-retry-toolbar"><button type="button" className="secondary" disabled={busy||!active||!colorJobs.some(job=>job.outputImages[0]&&job.dependencyStatus!=="stale")} title={!active?"请先选择颜色":"按顺序检测当前颜色的整套图片"} onClick={()=>run(checkActiveColorConsistency)}>质检当前整套</button><button type="button" className="secondary" disabled={!active||!colorJobs.some(job=>job.status==="failed"||job.status==="interrupted")} title={!active?"请先选择颜色":"当前颜色没有失败图片"} onClick={()=>setRetrySlots(Array.from({length:expectedCount},(_,index)=>index+1).filter(slot=>{const job=colorJobs.find(item=>item.slot===slot);return job?.status==="failed"||job?.status==="interrupted"}))}>选择失败图片</button><button type="button" className="primary" disabled={busy||retrySlots.length===0} title={!retrySlots.length?"请先勾选需要重试的单张图片":undefined} onClick={()=>run(retrySelected)}>重试选中单张{retrySlots.length?`（${retrySlots.length}）`:""}</button><a className="button secondary" href={`/api/projects/${p.id}/download`}>下载全部 ZIP</a><ClearResultsButton workflow="recolor" disabled={busy||!hasWorkflowResults(p,jobs,"recolor")} onConfirm={clearResults}/></div></div>
        {colors.length>0?<div className="recolor-result-tabs recolor-task-queue">{colors.map(color=>{const liveJobs=currentJobsFor(color),liveCount=new Set(liveJobs.flatMap(job=>job.outputImages)).size,done=Math.max(colorResultCount(color),liveCount),required=expectedColorResultCount(color),running=color.status==="generating"||liveJobs.some(job=>["queued","submitting","waiting_provider","downloading","validating","saving","generating"].includes(job.status)),complete=done>=required,marker=complete?"✓":running?"●":"○";return <button type="button" className={`${color.id===activeId?"active":""} ${complete?"complete":running?"running":"pending"}`} key={color.id} onClick={()=>{setHistoryJobId("");setActiveId(color.id)}}><i style={{background:VALID_HEX.test(color.hex||"")?color.hex:"#E8E8EE"}}/><span>{normalizedColorName(color)||"未命名颜色"}</span><small>{done}/{required} <b aria-hidden="true">{marker}</b></small></button>})}</div>:<div className="empty-state compact-empty">请先识别或手动添加颜色任务</div>}
        <div className="recolor-active-task-head"><div><b>{activeName||"未选择颜色"}</b><span>{active?`姿势 01 / 02 / 03 · ${colorResultCount(active)}/${expectedCount} 已完成`:"从上方队列选择一个颜色"}</span></div>{active&&<span className={`badge ${colorResultCount(active)>=expectedCount?"success":"wait"}`}>{active.status}</span>}</div>
        {active?<div className={`result-grid ${expectedCount===3?"three":expectedCount===4?"four":""}`}>{Array.from({length:expectedCount},(_,index)=>index+1).map(slot=>{const showingHistory=historyJob?.targetColorId===activeId&&historyJob.slot===slot,job=showingHistory?historyJob:colorJobs.find(item=>item.slot===slot),url=job?.outputImages[0],selected=retrySlots.includes(slot);return <div className={`recolor-result-pair selectable ${selected?"selected":""}`} key={`${slot}:${job?.id||"empty"}`}><label className="recolor-result-select"><input type="checkbox" checked={selected} onChange={()=>setRetrySlots(current=>selected?current.filter(item=>item!==slot):[...current,slot])}/><span>{selected?"已选择":"选择图片"}</span></label><ResultCard job={job} pending={active.status==="generating"} label={`${showingHistory?"历史 · ":""}复色后 · 姿势${slot}`} onPreview={url?()=>setPreview({images:historyItems.flatMap(item=>item.outputImages),index:Math.max(0,historyItems.flatMap(item=>item.outputImages).indexOf(url))}):undefined} onRetry={()=>run(()=>start(slot))} onFallbackRetry={route.fallback.configured?()=>run(()=>start(slot,"fallback")):undefined} onCorrect={job?request=>run(()=>post(`/api/jobs/${job.id}/retry`,{correctionRequest:request})):undefined} onInpaint={job?()=>inpaint.openInpaint(job):undefined} correctionBusy={busy}/><ConsistencyCheck job={job} busy={busy} onCheck={()=>job&&run(()=>checkConsistency(job.id))}/></div>})}</div>:<div className="empty-state">请先识别或添加颜色</div>}
        <div className="notice">生成图已自动保存并收集。请重点检查主体颜色是否完整匹配锁定色与 HEX，以及材质、织法、纹理、渐变、色块、包边、印花纽扣、模特姿势和服装结构是否保持一致；未真正改色或设计被改变的图片请单独重新生成。</div>
        <div className="recolor-results-footer"><a className="button primary" href={`/projects/${p.id}/final`}>查看最终结果 →</a></div>
      </section>
      <aside className="card recolor-collection-card"><div className="panel-head"><div><h2>已生成复色集合</h2><small>当前货号 {p.sku}</small></div><span className={`badge ${collectionItems.length?"success":"wait"}`}>{collectionItems.length} 张</span></div>{collectionItems.length?<div className="recolor-collection-grid">{collectionItems.map(({color,url,index},collectionIndex)=><article className="recolor-collection-item" key={`${color.id}:${url}`}><button className="image-button" type="button" onClick={()=>setPreview({images:collectionImages,index:collectionIndex})}><img src={url} alt={`${normalizedColorName(color)||"未命名颜色"}姿势${index+1}`}/></button><div className="recolor-collection-meta"><i style={{background:VALID_HEX.test(color.hex||"")?color.hex:"#E8E8EE"}}/><div><b>{normalizedColorName(color)||"未命名颜色"}</b><small>姿势 {index+1}</small></div></div><div className="recolor-collection-actions"><a href={url} download>下载</a><button type="button" onClick={()=>run(()=>removeCollectionImage(color,url))}>删除</button></div></article>)}</div>:<div className="empty-state compact-empty">生成成功的复色图会自动出现在这里。</div>}</aside>
    </div>
    <section className="card process-history recolor-process-history" aria-labelledby="recolor-process-history-title"><div className="process-history-head"><div><h2 id="recolor-process-history-title">历史生成记录</h2><small>点击小图回到该颜色与姿势的复色制作过程</small></div><div>{historyJob&&<button type="button" className="text-button" onClick={()=>setHistoryJobId("")}>返回当前结果</button>}<span>{historyItems.length} 张</span></div></div>{historyItems.length?<div className="process-history-grid recolor-history-grid">{historyItems.map((job,index)=><button type="button" className={job.id===historyJobId?"active":""} key={job.id} onClick={()=>{if(job.targetColorId)setActiveId(job.targetColorId);setHistoryJobId(job.id)}} title={`${job.colorName||"复色"} · 姿势 ${job.slot||1} · ${new Date(job.startedAt).toLocaleString("zh-CN")}`}><img src={job.outputImages[0]} alt={`复色历史生成图 ${index+1}`}/><span>{job.colorName||"复色"} · 姿势{job.slot||1}</span></button>)}</div>:<div className="process-history-empty">生成过的复色照片会保存在这里</div>}</section>
    {preview&&<ImagePreviewDialog {...preview} onClose={()=>setPreview(null)}/>}
    {inpaint.dialog}
  </>;
}
