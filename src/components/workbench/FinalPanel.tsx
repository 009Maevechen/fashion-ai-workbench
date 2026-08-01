"use client";

import {useMemo,useState} from "react";
import type {Job,Project} from "@/lib/db";
import ImagePreviewDialog from "./ImagePreviewDialog";
import {expectedColorResultCount} from "@/lib/color-sets";
import {finalPackageIssues} from "@/lib/final-package";
import {recolorColorsWithSavedJobs} from "@/lib/recolor-collection";

export default function FinalPanel({p,jobs,onStep,onComplete}:{p:Project;jobs:Job[];onStep:(step:number)=>void;onComplete:()=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[folderOpen,setFolderOpen]=useState(false),[preview,setPreview]=useState<{images:string[];index:number}|null>(null);
  const colors=recolorColorsWithSavedJobs(p,jobs),resultColors=colors.filter(color=>color.poseResults?.some(Boolean)),packageProject={...p,targetColors:colors};
  const groups=useMemo(()=>[
    {title:"已确认换装图",images:p.confirmedTryonImage?[p.confirmedTryonImage]:[]},
    {title:"原色姿势图",images:p.confirmedPoseImages||[]},
    ...resultColors.map((c,index)=>{const images=[...new Set((c.poseResults||[]).filter(Boolean))];return {title:`${c.name.trim()||`颜色${index+1}`}复色集合${images.length<expectedColorResultCount(c)?"（导出已有照片）":""}`,images}}),
  ],[p,resultColors]);
  const failed=jobs.filter(job=>job.status==="failed"||job.status==="interrupted"),warnings=finalPackageIssues(packageProject);
  function downloadArchive(){const link=document.createElement("a");link.href=`/api/projects/${p.id}/download`;link.download=`${p.sku}_results.zip`;document.body.appendChild(link);link.click();link.remove()}
  async function confirmAndDownload(){setBusy(true);setError("");try{if(p.status!=="已完成")await onComplete();downloadArchive()}catch(e){setError(e instanceof Error?e.message:"无法确认并导出货号整组结果")}finally{setBusy(false)}}
  const all=[...new Set(groups.flatMap(g=>g.images))];
  return <div className="stack"><section className="card"><div className="panel-head"><div><h2>最终结果</h2><small>复色生成结束后，已有图片会自动归入下方的货号文件夹</small></div><span className={`badge ${all.length?"success":"wait"}`}>{all.length?`已收集 ${all.length} 张`:"暂无最终结果"}</span></div><div className="summary-grid"><div><b>{all.length}</b><span>文件夹内图片</span></div><div><b>{resultColors.length}</b><span>有结果的复色颜色</span></div><div><b>{failed.length}</b><span>失败任务（不影响文件夹）</span></div><div><b>outputs/{p.sku}</b><span>货号保存位置</span></div></div>{warnings.length>0?<div className="notice"><b>以下内容不会阻止打开或压缩文件夹：</b>{warnings.map(x=><div key={x}>• {x}</div>)}</div>:<p>该货号的换装图、原色姿势图和全部复色结果已汇总到同一个文件夹。</p>}{failed.length>0&&<details><summary className="danger-text">查看 {failed.length} 个失败任务（已忽略）</summary>{failed.map(job=><div key={job.id}>{job.workflow} #{job.slot}：{job.error||"任务中断"}</div>)}</details>}{error&&<div className="error">{error}</div>}</section>
    <section className={`card final-folder-card ${folderOpen?"open":"closed"}`}>{folderOpen?<><div className="final-folder-toolbar"><div className="final-folder-path"><button type="button" onClick={()=>setFolderOpen(false)}>最终结果</button><span>/</span><b>{p.sku}</b></div><div className="actions"><button className="secondary" type="button" onClick={()=>setFolderOpen(false)}>关闭文件夹</button><button className="primary" type="button" disabled={busy||all.length===0} onClick={confirmAndDownload}>{busy?"正在压缩…":"压缩并下载 ZIP"}</button></div></div><div className="final-folder-open-head"><span className="final-folder-icon" aria-hidden="true">📂</span><div><h2>{p.sku} · {p.productName}</h2><small>{all.length} 张最终结果 · 文件夹内可查看和单张下载</small></div></div><div className="final-sku-package">{groups.map(group=><div className="final-result-group" key={group.title}><div className="panel-head compact"><h3>{group.title}</h3><span>{group.images.length}张</span></div>{group.images.length?<div className="image-grid">{group.images.map(url=><article className="image-card" key={url}><button className="image-button" onClick={()=>setPreview({images:all,index:all.indexOf(url)})}><img src={url} alt={group.title}/></button><div className="actions"><a className="button secondary" href={url} download>单张下载</a></div></article>)}</div>:<div className="empty-state">当前分类还没有图片</div>}</div>)}</div></>:<button className="final-folder-cover" type="button" onClick={()=>setFolderOpen(true)}><span className="final-folder-icon" aria-hidden="true">📁</span><span className="final-folder-info"><b>{p.sku} 最终结果</b><small>{p.productName} · {all.length} 张图片 · {resultColors.length} 款复色</small></span><span className="final-folder-open-button">打开文件夹 →</span></button>}</section>
    <div className="actions"><button className="secondary" onClick={()=>onStep(2)}>返回换装</button><button className="secondary" onClick={()=>onStep(3)}>返回姿势</button><button className="secondary" onClick={()=>onStep(4)}>返回复色</button></div>{preview&&<ImagePreviewDialog {...preview} onClose={()=>setPreview(null)}/>}</div>;
}
