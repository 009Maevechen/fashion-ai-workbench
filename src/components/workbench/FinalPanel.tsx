"use client";

import {useState} from "react";
import type {Job,Project} from "@/lib/db";
import ImagePreviewDialog from "./ImagePreviewDialog";
import {expectedColorResultCount,normalizedColorName} from "@/lib/color-sets";
import {recolorColorsWithSavedJobs} from "@/lib/recolor-collection";

type GalleryImage={url?:string;label:string;status:"passed"|"review"|"failed";job?:Job};
type GalleryGroup={title:string;swatch?:string;images:GalleryImage[]};
const ACTIVE_STATUSES=["queued","generating","uploading","submitting","waiting_provider","downloading","validating","saving"];

export default function FinalPanel({p,jobs,onStep,onComplete}:{p:Project;jobs:Job[];onStep:(step:number)=>void;onComplete:()=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[folderOpen,setFolderOpen]=useState(false),[preview,setPreview]=useState<{images:string[];index:number}|null>(null);
  const colors=recolorColorsWithSavedJobs(p,jobs),recolorJobs=jobs.filter(job=>job.workflow==="recolor"),failedJobs=recolorJobs.filter(job=>job.status==="failed"||job.status==="interrupted");
  const jobFor=(url?:string,colorId?:string,slot?:number)=>recolorJobs.find(job=>(url&&job.outputImages.includes(url))||(colorId&&job.targetColorId===colorId&&job.slot===slot));
  const stateFor=(job?:Job,url?:string):GalleryImage["status"]=>job?.status==="failed"||job?.status==="interrupted"?"failed":job?.status==="confirmed"||job?.status==="success"?"passed":url?"review":ACTIVE_STATUSES.includes(job?.status||"")?"review":"failed";
  const groups:GalleryGroup[]=[
    {title:"原色",images:Array.from({length:3},(_,index)=>{const url=p.confirmedPoseImages?.[index];return {url,label:`姿势 ${String(index+1).padStart(2,"0")}`,status:url?"passed":"failed"}})},
    ...colors.map((color,colorIndex)=>({title:normalizedColorName(color)||`颜色 ${colorIndex+1}`,swatch:color.hex,images:Array.from({length:expectedColorResultCount(color)},(_,index)=>{const url=color.poseResults?.[index],job=jobFor(url,color.id,index+1);return {url,label:`姿势 ${String(index+1).padStart(2,"0")}`,status:stateFor(job,url),job}})})),
  ];
  const galleryImages=groups.flatMap(group=>group.images),available=galleryImages.filter(image=>image.url),passed=galleryImages.filter(image=>image.status==="passed"&&image.url).length,review=galleryImages.filter(image=>image.status==="review").length,failed=galleryImages.filter(image=>image.status==="failed").length,previewImages=available.flatMap(image=>image.url?[image.url]:[]);
  function downloadArchive(){const link=document.createElement("a");link.href=`/api/projects/${p.id}/download`;link.download=`${p.sku}_results.zip`;document.body.appendChild(link);link.click();link.remove()}
  async function completeProject(){setBusy(true);setError("");try{await onComplete()}catch(e){setError(e instanceof Error?e.message:"无法标记项目完成")}finally{setBusy(false)}}
  return <div className="stack final-qc-page">
    <section className="card final-qc-toolbar">
      <div className="final-qc-title"><div><span className="eyebrow">图片交付画廊</span><h2>{p.sku} · {p.productName}</h2></div><span className={`badge ${p.status==="已完成"?"success":"wait"}`}>{p.status}</span></div>
      <div className="final-qc-metrics"><div className="passed"><b>{passed}</b><span>已通过</span></div><div className="review"><b>{review}</b><span>待审核</span></div><div className="failed"><b>{failed}</b><span>失败</span></div></div>
      <div className="final-qc-actions"><button className="primary" type="button" disabled={!available.length} title={!available.length?"还没有可下载的图片":undefined} onClick={downloadArchive}>下载全部</button><button className="secondary" type="button" disabled={!available.length} title={!available.length?"还没有已保存的图片":undefined} onClick={()=>setFolderOpen(value=>!value)}>{folderOpen?"收起文件夹":"打开文件夹"}</button><button className="secondary" type="button" disabled={!failedJobs.length} title={!failedJobs.length?"没有失败项":undefined} onClick={()=>onStep(4)}>重新生成失败项</button><button className="primary final-complete-button" type="button" disabled={busy||!available.length} title={!available.length?"至少需要一张交付图片":undefined} onClick={completeProject}>{busy?"正在保存…":"标记项目完成"}</button></div>
      {folderOpen&&<div className="final-folder-inline"><span aria-hidden="true">📂</span><div><b>outputs/{p.sku}</b><small>{available.length} 张已持久化保存的交付图片</small></div><a className="button secondary" href={`/api/projects/${p.id}/download`}>压缩并下载 ZIP</a></div>}
      {error&&<div className="error">{error}</div>}
    </section>
    <section className="card final-delivery-gallery">
      {groups.map(group=><section className="final-qc-group" key={group.title}><div className="final-qc-group-head"><div>{group.swatch&&<i style={{background:group.swatch}}/>}<h3>{group.title}</h3></div><span>{group.images.filter(image=>image.url).length}/{group.images.length}</span></div><div className="final-qc-grid">{group.images.map((image,index)=><article className={`final-qc-image ${image.status}`} key={`${group.title}-${index}`}><div className="final-qc-image-head"><b>{image.label}</b><span>{image.status==="passed"?"已通过":image.status==="review"?"待审核":"失败"}</span></div>{image.url?<button className="image-button" type="button" onClick={()=>setPreview({images:previewImages,index:previewImages.indexOf(image.url!)})}><img src={image.url} alt={`${group.title}${image.label}`}/></button>:<div className="final-qc-placeholder"><b>暂无图片</b><small>{image.job?.error||"返回复色页单张重试"}</small></div>}<div className="final-qc-image-actions">{image.url&&<><button type="button" onClick={()=>setPreview({images:previewImages,index:previewImages.indexOf(image.url!)})}>查看大图</button><a href={image.url} download>下载</a></>}{image.status==="failed"&&<button type="button" onClick={()=>onStep(4)}>单张重试</button>}</div></article>)}</div></section>)}
    </section>
    <div className="actions final-back-actions"><button className="secondary" onClick={()=>onStep(2)}>返回换装</button><button className="secondary" onClick={()=>onStep(3)}>返回姿势</button><button className="secondary" onClick={()=>onStep(4)}>返回复色</button></div>{preview&&<ImagePreviewDialog {...preview} onClose={()=>setPreview(null)}/>}
  </div>;
}
