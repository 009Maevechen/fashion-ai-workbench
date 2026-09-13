"use client";
import {useState} from "react";
import type {Job} from "@/lib/db";
import {previewUrl} from "@/lib/image-url";
import InpaintEditor,{type InpaintMask} from "./InpaintEditor";
import ImagePreviewDialog from "./ImagePreviewDialog";

export type InpaintRequest={sourceImageId:string;sourceStep:Job["workflow"];sourceUrl:string;maskDataUrl:string;editPrompt:string};
const blobDataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("蒙版读取失败"));reader.readAsDataURL(blob)});

export default function InpaintDialog({job,sourceStep,busy,onSubmit,onDecision,onClose}:{job:Job;sourceStep:Job["workflow"];busy:boolean;onSubmit:(request:InpaintRequest)=>Promise<Job>;onDecision:(job:Job,action:"accept"|"keep_source")=>Promise<void>;onClose:()=>void}){
  const sourceUrl=job.outputImages[0],[mask,setMask]=useState<InpaintMask>({blob:null,hasMask:false}),[editPrompt,setEditPrompt]=useState(""),[error,setError]=useState(""),[candidate,setCandidate]=useState<Job|null>(null),[iteration,setIteration]=useState(0),[preview,setPreview]=useState<{images:string[];index:number}|null>(null);
  async function submit(){
    if(!mask.hasMask||!mask.blob){setError("请先用画笔涂抹出需要修改的区域");return}
    if(!editPrompt.trim()){setError("请输入修改咒语");return}
    setError("");
    try{const result=await onSubmit({sourceImageId:job.id,sourceStep,sourceUrl,maskDataUrl:await blobDataUrl(mask.blob),editPrompt:editPrompt.trim()});setCandidate(result)}catch(value){setError(value instanceof Error?value.message:"局部重绘失败")}
  }
  async function decide(action:"accept"|"keep_source"){if(!candidate)return;setError("");try{await onDecision(candidate,action)}catch(value){setError(value instanceof Error?value.message:"候选处理失败")}}
  function continueEdit(){setCandidate(null);setMask({blob:null,hasMask:false});setEditPrompt("");setIteration(value=>value+1)}
  const candidateUrl=candidate?.outputImages[0],comparison=candidateUrl?[sourceUrl,candidateUrl]:[];
  return <div className="inpaint-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose()}}>
    <section className="inpaint-dialog" role="dialog" aria-modal="true" aria-label="局部重绘">
      <header className="inpaint-dialog-head"><div><small>LOCAL INPAINTING</small><h2>局部重绘</h2><p>只修改 Mask 区域；候选不会覆盖正式图，确认后才替换。</p></div><button type="button" className="settings-dialog-close" aria-label="关闭" disabled={busy} onClick={onClose}>×</button></header>
      <div className="inpaint-dialog-body">
        {!candidate&&<><InpaintEditor key={iteration} src={sourceUrl} onChange={setMask}/><div className="inpaint-prompt-area"><details className="inpaint-spell-collapse" open><summary className="spell-collapse-summary"><span><b>✨ 修改咒语</b><small>明确数量、颜色和位置</small></span></summary><div className="inpaint-spell-body"><label className="field">修改咒语<textarea maxLength={800} placeholder="例如：把此处4颗扣子改成3颗，其他区域保持不变" value={editPrompt} onChange={event=>setEditPrompt(event.target.value)}/><span className="field-count">{editPrompt.length}/800</span></label></div></details><div className="inpaint-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>取消</button><button type="button" className="primary" disabled={busy||!mask.hasMask||!editPrompt.trim()} onClick={()=>void submit()}>{busy?"生成与QC中…":"生成候选版本"}</button></div></div></>}
        {candidate&&candidateUrl&&<div className="inpaint-candidate-review"><div className="panel-head"><div><h3>原图与候选版本</h3><small>QC：{candidate.qcStatus||"NEEDS_REVIEW"}{candidate.errorCode?` · ${candidate.errorCode}`:""}</small></div></div><div className="inpaint-compare-grid">{comparison.map((url,index)=><button type="button" className="image-button" key={url} onClick={()=>setPreview({images:comparison,index})}><b>{index===0?"正式原图":"修改候选"}</b><img loading="lazy" decoding="async" src={previewUrl(url,960)} alt={index===0?"正式原图":"局部重绘候选"}/><span>点击加载高清原图</span></button>)}</div>{candidate.qualityIssues?.length?<div className="inpaint-qc-issues"><b>QC 检查结果</b><ul>{candidate.qualityIssues.map(issue=><li key={issue}>{issue}</li>)}</ul></div>:<p className="notice">自动 QC 未发现明显问题，仍请人工检查修改部位与 Mask 外区域。</p>}<div className="inpaint-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void decide("accept")}>确认替换</button><button type="button" className="secondary" disabled={busy} onClick={()=>void decide("keep_source")}>保留原图</button><button type="button" className="secondary" disabled={busy} onClick={continueEdit}>继续重绘</button></div></div>}
        {error&&<div className="error">{error}</div>}
      </div>
    </section>
    {preview&&<ImagePreviewDialog images={preview.images} index={preview.index} onClose={()=>setPreview(null)}/>}
  </div>;
}
