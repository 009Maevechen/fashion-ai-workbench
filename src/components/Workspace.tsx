"use client";

import {useCallback,useEffect,useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import type {Job,Project,ProjectAssets} from "@/lib/db";
import ProjectHeader from "./workbench/ProjectHeader";
import RecentTaskList from "./workbench/RecentTaskList";
import TryonPanel from "./workbench/TryonPanel";
import PosePanel from "./workbench/PosePanel";
import RecolorPanel from "./workbench/RecolorPanel";
import FinalPanel from "./workbench/FinalPanel";
import ProductDetailsPanel from "./workbench/ProductDetailsPanel";
import type {ApiHealth,PanelProps,Runner} from "./workbench/types";
import type {WorkflowRuntimeSummary} from "@/lib/ai/provider-settings-types";
export type {ApiHealth} from "./workbench/types";

const STEP_PATH:Record<number,string>={1:"/details",2:"/tryon",3:"/pose",4:"/recolor",5:"/final"};
export default function Workspace({initial,initialJobs,health,modelRouting,initialStep}:{initial:Project;initialJobs:Job[];health:ApiHealth;modelRouting:WorkflowRuntimeSummary;initialStep?:number}){
  const router=useRouter(),search=useSearchParams();
  const requested=initialStep||Number(search.get("step")||initial.currentStep);
  const [p,setP]=useState(initial),[step,setStep]=useState(Math.min(Math.max(requested,1),5)),[jobs,setJobs]=useState(initialJobs),[pendingActions,setPendingActions]=useState(0),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const busy=pendingActions>0;
  const goStep=(next:number)=>{if(next===5&&p.currentStep<5)return;setStep(next);router.push(`/projects/${p.id}${STEP_PATH[next]}`,{scroll:false})};
  const latest=(workflow:string,byColor=false)=>{const map=new Map<string,Job>();for(const job of jobs.filter(x=>x.workflow===workflow)){const key=`${byColor?job.targetColorId||"":workflow}:${job.slot||0}`;if(!map.has(key))map.set(key,job)}return [...map.values()].sort((a,b)=>(a.slot||0)-(b.slot||0))};
  const refresh=useCallback(async()=>{const [project,responseJobs]=await Promise.all([fetch(`/api/projects/${p.id}`,{cache:"no-store"}).then(r=>r.json()),fetch(`/api/jobs?projectId=${p.id}`,{cache:"no-store"}).then(r=>r.json())]);setP(project);setJobs(responseJobs)},[p.id]);
  // 响应顶部“刷新”按钮：只重新拉取最新项目与任务数据，绝不清空任何状态或重新提交 API。
  useEffect(()=>{const handler=()=>{void refresh()};window.addEventListener("workbench:refresh",handler);return()=>window.removeEventListener("workbench:refresh",handler)},[refresh]);
  async function persistAsset(file:File|undefined,key:keyof ProjectAssets,name:string,index?:number){if(!file)throw new Error("请选择图片");const form=new FormData();form.set("file",file);form.set("sku",p.sku);form.set("name",name);form.set("projectId",p.id);form.set("assetKey",key);if(index!==undefined)form.set("index",String(index));const response=await fetch("/api/upload",{method:"POST",body:form}),data=await response.json();if(!response.ok)throw new Error(data.error);await refresh();return data.url as string}
  async function deleteAsset(key:keyof ProjectAssets,index?:number){const response=await fetch(`/api/projects/${p.id}/assets`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({assetKey:key,index})}),data=await response.json();if(!response.ok)throw new Error(data.error);setP(data)}
  async function clearSourceAssets(){setError("");setNotice("");const response=await fetch(`/api/projects/${p.id}/assets/clear`,{method:"DELETE"}),data=await response.json();if(!response.ok)throw new Error(data.error||"清空素材失败");setP(data.project);setNotice(data.message||"当前任务素材已清空，生成结果已保留");return data.project as Project}
  async function clearWorkflowResults(workflow:"tryon"|"pose"|"recolor"){setError("");setNotice("");const response=await fetch(`/api/projects/${p.id}/results/${workflow}`,{method:"DELETE"}),data=await response.json();if(!response.ok)throw new Error(data.error||"清空结果失败");setP(data.project);setJobs(current=>current.filter(job=>job.workflow!==workflow));setNotice(data.message||"当前模块结果已清空，上传素材已保留");return data.project as Project}
  async function cancelGeneration(workflow:"tryon"|"pose"|"recolor"){setError("");const response=await fetch(`/api/projects/${p.id}/cancel`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workflow})}),data=await response.json();if(!response.ok)throw new Error(data.error||"暂停生图失败");await refresh();setNotice("已暂停当前生图任务")}
  async function clearWorkflowErrors(workflow:"tryon"|"pose"|"recolor"){setError("");const response=await fetch(`/api/projects/${p.id}/errors/${workflow}`,{method:"DELETE"}),data=await response.json();if(!response.ok)throw new Error(data.error||"清空错误内容失败");await refresh();setNotice(data.message||"错误生图内容已清空")}
  async function saveProject(patch:Partial<Project>){const response=await fetch(`/api/projects/${p.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)}),data=await response.json();if(!response.ok)throw new Error(data.error);setP(data);return data}
  async function post(url:string,body:unknown){const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.error);if(!data.jobId)return data;for(let attempt=0;attempt<120;attempt++){if(document.visibilityState!=="visible"){await new Promise(resolve=>setTimeout(resolve,2500));continue}const poll=await fetch(`/api/jobs/${data.jobId}`,{cache:"no-store"}),state=await poll.json();if(!poll.ok)throw new Error(state.error||"任务状态查询失败");if(attempt%2===0||["success","failed","interrupted"].includes(state.status))await refresh();if(state.status==="success")return state;if(state.status==="interrupted")return state;if(state.status==="failed")throw new Error(state.error||"生成任务失败");await new Promise(resolve=>setTimeout(resolve,2500))}throw new Error("本地任务等待超时，请在历史任务中查看并重试")}
  async function enqueue(url:string,body:unknown){const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.error);await refresh();return data}
  const run:Runner=fn=>{setPendingActions(value=>value+1);setError("");void fn().then(refresh).catch(e=>setError(e instanceof Error?e.message:"操作失败")).finally(()=>setPendingActions(value=>Math.max(0,value-1)))};
  async function confirmFlow(workflow:string,images:string[]){await post(`/api/projects/${p.id}/confirm`,{workflow,images});const next=workflow==="tryon"?3:workflow==="pose"?4:5;await refresh();goStep(next)}
  async function complete(){await post(`/api/projects/${p.id}/complete`,{});await refresh()}
  const common:Omit<PanelProps,"jobs">={p,health,modelRouting,busy,run,refreshProject:refresh,persistAsset,deleteAsset,clearSourceAssets,clearWorkflowResults,cancelGeneration,clearWorkflowErrors,saveProject,post,enqueue,confirmFlow};
  return <><ProjectHeader project={p} step={step} onStep={goStep}/>{error&&<div className="error">{error}</div>}{notice&&<div className="notice workspace-notice">{notice}</div>}
    {step===1&&<ProductDetailsPanel p={p} jobs={jobs} busy={busy} run={run} persistAsset={persistAsset} deleteAsset={deleteAsset} clearSourceAssets={clearSourceAssets} saveProject={saveProject} onNext={()=>goStep(2)}/>}
    {step===2&&<TryonPanel {...common} jobs={latest("tryon")} historyJobs={jobs.filter(job=>job.workflow==="tryon")}/>}
    {step===3&&<PosePanel {...common} jobs={latest("pose")} historyJobs={jobs.filter(job=>job.workflow==="pose")}/>}
    {step===4&&<RecolorPanel {...common} jobs={latest("recolor",true)} historyJobs={jobs.filter(job=>job.workflow==="recolor")}/>}
    {step===5&&<FinalPanel p={p} jobs={jobs} onStep={goStep} onComplete={complete} enqueue={enqueue}/>}
    <RecentTaskList jobs={jobs}/>
  </>;
}
