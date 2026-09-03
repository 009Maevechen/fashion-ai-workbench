"use client";

import {isWorkflowGenerating} from "@/lib/generation-cancel";
import type {Job} from "@/lib/db";
import type {WorkflowType,Runner} from "./types";

// 「暂停生图」与「清空错误内容」：生成中显示暂停按钮，存在失败/中断任务时显示清空按钮。
export default function GenerationControls({workflow,jobs,cancelGeneration,clearWorkflowErrors,run}:{workflow:WorkflowType;jobs:Job[];cancelGeneration:(workflow:WorkflowType)=>Promise<void>;clearWorkflowErrors:(workflow:WorkflowType)=>Promise<void>;run:Runner}){
  const generating=isWorkflowGenerating(jobs,workflow);
  const hasErrors=jobs.some(job=>job.workflow===workflow&&(job.status==="failed"||job.status==="interrupted"));
  if(!generating&&!hasErrors)return null;
  return <>{generating&&<button type="button" className="danger" onClick={()=>run(()=>cancelGeneration(workflow))}>⏸ 暂停生图</button>}{hasErrors&&<button type="button" className="secondary" onClick={()=>run(()=>clearWorkflowErrors(workflow))}>清空错误内容</button>}</>;
}
