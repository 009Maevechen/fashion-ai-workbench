"use client";

import {useEffect,useState} from "react";
import type {Project} from "@/lib/db";
import type {WorkflowType} from "@/lib/ai/types";

const LABEL:Record<WorkflowType,string>={tryon:"换装",pose:"姿势",recolor:"复色"};

export default function WorkflowSkuExport({project,workflow,onSaved}:{project:Project;workflow:WorkflowType;onSaved:(project:Project)=>void}){
  const saved=project.settings.workflowSkus?.[workflow]||project.sku;
  const [sku,setSku]=useState(saved),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  useEffect(()=>{setSku(project.settings.workflowSkus?.[workflow]||project.sku);setNotice("")},[project,workflow]);
  async function save(){const value=sku.trim();if(!value)throw new Error("货号不能为空");setBusy(true);setNotice("");try{const response=await fetch(`/api/projects/${project.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({settings:{...project.settings,workflowSkus:{...project.settings.workflowSkus,[workflow]:value}}})}),data=await response.json() as Project&{error?:string};if(!response.ok)throw new Error(data.error||"货号保存失败");onSaved(data);setNotice("已保存")}finally{setBusy(false)}}
  const value=sku.trim();
  return <div className="workflow-sku-export"><label><span>{LABEL[workflow]}货号</span><input value={sku} maxLength={80} onChange={event=>{setSku(event.target.value);setNotice("")}} onKeyDown={event=>{if(event.key==="Enter")void save()}} placeholder="填写本流程货号"/></label><button type="button" disabled={busy||!value||value===saved} onClick={()=>void save()}>{busy?"保存中":"保存"}</button><a className={!value?"disabled":""} aria-disabled={!value} href={value?`/api/projects/${project.id}/download?workflow=${workflow}&sku=${encodeURIComponent(value)}`:undefined}>导出本流程</a>{notice&&<small>{notice}</small>}</div>;
}
