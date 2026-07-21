"use client";

import {useMemo,useState} from "react";
import type {Project} from "@/lib/db";
import ImagePreviewDialog from "./ImagePreviewDialog";

export default function FinalPanel({p,onStep,onComplete}:{p:Project;onStep:(step:number)=>void;onComplete:()=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[preview,setPreview]=useState<{images:string[];index:number}|null>(null);
  const confirmedColors=(p.targetColors||[]).filter(c=>c.status==="confirmed"&&c.poseResults?.length===3);
  const groups=useMemo(()=>[
    {title:"已确认换装图",images:p.confirmedTryonImage?[p.confirmedTryonImage]:[]},
    {title:"原色姿势图",images:p.confirmedPoseImages||[]},
    ...confirmedColors.map(c=>({title:`${c.name}复色套装`,images:c.poseResults||[]})),
  ],[p,confirmedColors]);
  const blockers=[!p.confirmedTryonImage&&"尚未确认换装结果",p.confirmedPoseImages?.length!==3&&"尚未确认三张姿势图",confirmedColors.length===0&&"尚未确认任何复色套装",p.dependencyStatus==="stale"&&"上游素材变化，存在需要重新审核的结果"].filter(Boolean) as string[];
  async function complete(){setBusy(true);setError("");try{await onComplete()}catch(e){setError(e instanceof Error?e.message:"无法完成项目")}finally{setBusy(false)}}
  const all=groups.flatMap(g=>g.images);
  return <div className="stack"><section className="card"><div className="panel-head"><h2>最终验收</h2><span className={`badge ${blockers.length?"wait":"success"}`}>{blockers.length?"尚未满足完成条件":"可以标记完成"}</span></div>{blockers.length?<div className="notice">{blockers.map(x=><div key={x}>• {x}</div>)}</div>:<p>全部确认节点均已完成，文件已持久化保存。</p>}{error&&<div className="error">{error}</div>}<button className="primary" disabled={busy||blockers.length>0||p.status==="已完成"} onClick={complete}>{p.status==="已完成"?"项目已完成":"确认最终结果并标记项目完成"}</button></section>
    {groups.map(group=><section className="card" key={group.title}><div className="panel-head"><h2>{group.title}</h2><span className="badge">{group.images.length}张</span></div>{group.images.length?<div className="image-grid">{group.images.map(url=><article className="image-card" key={url}><button className="image-button" onClick={()=>setPreview({images:all,index:all.indexOf(url)})}><img src={url} alt={group.title}/></button><div className="actions"><a className="button secondary" href={url} download>单张下载</a></div></article>)}</div>:<div className="empty-state">尚未确认结果</div>}</section>)}
    <div className="actions"><a className="button" href={`/api/projects/${p.id}/download`}>下载当前项目全部结果</a><button className="secondary" onClick={()=>onStep(2)}>返回换装</button><button className="secondary" onClick={()=>onStep(3)}>返回姿势</button><button className="secondary" onClick={()=>onStep(4)}>返回复色</button></div>{preview&&<ImagePreviewDialog {...preview} onClose={()=>setPreview(null)}/>}</div>;
}
