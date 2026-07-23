"use client";

import {useState} from "react";
import type {Job,Project} from "@/lib/db";

const ROUTE={tryon:"tryon",pose:"pose",recolor:"recolor"} as const;
const LABEL={tryon:"服装换装",pose:"三种姿势",recolor:"服装复色"} as const;

export default function HistoryTaskTable({initialJobs,projects}:{initialJobs:Job[];projects:Pick<Project,"id"|"productName">[]}){
  const [jobs,setJobs]=useState(initialJobs),[busy,setBusy]=useState(""),[error,setError]=useState("");
  const names=new Map(projects.map(project=>[project.id,project.productName]));
  async function retry(job:Job,modelPreference:"primary"|"fallback"){
    setBusy(`${job.id}:${modelPreference}`);setError("");
    try{
      const response=await fetch(`/api/jobs/${job.id}/retry`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({modelPreference})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"任务重试失败");
      setJobs(current=>current.map(item=>item.id===job.id?{...item,status:"queued",phase:"queued",error:undefined}:item));
    }catch(reason){setError(reason instanceof Error?reason.message:"任务重试失败")}finally{setBusy("")}
  }
  if(!jobs.length)return <div className="empty-state">没有符合条件的真实任务记录。</div>;
  return <>{error&&<div className="error">{error}</div>}<div className="table-scroll"><table className="table"><thead><tr><th>商品项目</th><th>工作步骤</th><th>Provider / 模型</th><th>状态与时间</th><th>结果 / 失败原因</th><th>操作</th></tr></thead><tbody>{jobs.map(job=>{
    const canRetry=["failed","interrupted"].includes(job.status)||["failed","interrupted"].includes(job.phase||"");
    return <tr key={job.id}><td><b>{job.sku}</b><br/><span className="muted">{names.get(job.projectId)||"未命名商品"}</span></td><td>{LABEL[job.workflow]} #{String(job.slot||1).padStart(2,"0")}</td><td>{job.provider||"未提交"}<br/><span className="muted">{job.model||"未选择模型"}</span></td><td><span className={`badge ${canRetry?"wait":job.status==="success"||job.status==="confirmed"?"success":""}`}>{job.phase||job.status}</span><br/><span className="muted">开始：{new Date(job.startedAt).toLocaleString("zh-CN")}<br/>{job.finishedAt?`完成：${new Date(job.finishedAt).toLocaleString("zh-CN")}`:"尚未完成"}</span></td><td>{job.outputImages.length?job.outputImages.map((url,index)=><a key={url} href={url} target="_blank" rel="noreferrer">查看结果{index+1} </a>):<span className="muted">暂无输出</span>}{job.error&&<details><summary className="danger-text">查看真实错误</summary><pre className="technical-error">{job.error}</pre></details>}</td><td><div className="history-actions"><a className="button secondary" href={`/projects/${job.projectId}/${ROUTE[job.workflow]}`}>返回项目</a>{canRetry&&<><button disabled={Boolean(busy)} onClick={()=>retry(job,"primary")}>{busy===`${job.id}:primary`?"正在提交":"只重试此图"}</button><button className="fallback-button" disabled={Boolean(busy)} onClick={()=>retry(job,"fallback")}>{busy===`${job.id}:fallback`?"正在提交":"备用模型重试"}</button></>}</div></td></tr>;
  })}</tbody></table></div></>;
}
