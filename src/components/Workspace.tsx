"use client";

import {resultWorkflow} from "@/lib/tryon-confirmation";
import {useCallback,useEffect,useRef,useState} from "react";
import {usePathname,useSearchParams} from "next/navigation";
import {projectStepFromPath,projectStepHref} from "@/lib/project-navigation";
import type {Job,Project,ProjectAssets} from "@/lib/db";
import ProjectHeader from "./workbench/ProjectHeader";
import RecentTaskList from "./workbench/RecentTaskList";
import TryonPanel from "./workbench/TryonPanel";
import PosePanel from "./workbench/PosePanel";
import RecolorPanel from "./workbench/RecolorPanel";
import FinalPanel from "./workbench/FinalPanel";
import ProductDetailsPanel from "./workbench/ProductDetailsPanel";
import {useProductionNavigation} from "./workbench/ProductionNavigationGuard";
import type {ApiHealth,PanelProps,Runner} from "./workbench/types";
import type {WorkflowRuntimeSummary} from "@/lib/ai/provider-settings-types";
import '../styles/windows-theme.css';
export type {ApiHealth} from "./workbench/types";

export default function Workspace({initial,initialJobs,health,modelRouting,initialStep}:{initial:Project;initialJobs:Job[];health:ApiHealth;modelRouting:WorkflowRuntimeSummary;initialStep?:number}){
  const search=useSearchParams(),pathname=usePathname();
  const {navigate}=useProductionNavigation();
  const step=projectStepFromPath(pathname,initialStep||Number(search.get("step")||initial.currentStep));
  const [p,setP]=useState(initial),[jobs,setJobs]=useState(initialJobs),[pendingActions,setPendingActions]=useState(0),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const autoAnalysisProject=useRef("");
  const busy=pendingActions>0;
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isWindows = navigator.platform.includes('Win') || 
                        navigator.userAgent.includes('Windows');
      if (isWindows) {
        document.body.classList.add('windows-platform');
      }
    }
  }, []);
  
  const goStep=(next:number,bypass=false)=>{navigate(projectStepHref(p.id,next),{scroll:false,bypass})};
  const latest=(workflow:string,byColor=false)=>{const map=new Map<string,Job>();for(const job of jobs.filter(x=>resultWorkflow(x)===workflow)){const key=`${byColor?job.targetColorId||"":workflow}:${job.slot||0}`;if(!map.has(key))map.set(key,job)}return [...map.values()].sort((a,b)=>(a.slot||0)-(b.slot||0))};
  const refresh=useCallback(async()=>{const [project,responseJobs]=await Promise.all([fetch(`/api/projects/${p.id}`,{cache:"no-store"}).then(r=>r.json()),fetch(`/api/jobs?projectId=${p.id}`,{cache:"no-store"}).then(r=>r.json())]);setP(project);setJobs(responseJobs)},[p.id]);
  useEffect(()=>{
    if(search.get("autoAnalyze")!=="1"||autoAnalysisProject.current===p.id||!p.assets.garmentImage)return;
    autoAnalysisProject.current=p.id;
    const url=new URL(window.location.href);url.searchParams.delete("autoAnalyze");window.history.replaceState(window.history.state,"",url);
    setPendingActions(value=>value+1);setError("");setNotice("高清产品图已保存，正在详细识别服装类型、版型、面料和结构细节…");
    void fetch(`/api/projects/${p.id}/product-analyze`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"产品图片识别失败");await refresh();setNotice("产品图详细识别完成：结果已写入商品资料，请检查后确认。")})
      .catch(cause=>setError(cause instanceof Error?cause.message:"产品图片识别失败"))
      .finally(()=>setPendingActions(value=>Math.max(0,value-1)));
  },[p.id,p.assets.garmentImage,refresh,search]);
  // 响应顶部“刷新”按钮：只重新拉取最新项目与任务数据，绝不清空任何状态或重新提交 API。
  useEffect(()=>{const handler=()=>{void refresh()};window.addEventListener("workbench:refresh",handler);return()=>window.removeEventListener("workbench:refresh",handler)},[refresh]);
  async function persistAsset(file:File|undefined,key:keyof ProjectAssets,name:string,index?:number){
    if(!file)throw new Error("请选择图片");
    const form=new FormData();form.set("file",file);form.set("sku",p.sku);form.set("name",name);form.set("projectId",p.id);form.set("assetKey",key);
    if(index!==undefined)form.set("index",String(index));
    const response=await fetch("/api/upload",{method:"POST",body:form}),data=await response.json();
    if(!response.ok)throw new Error(data.error);
    if(key==="garmentImage"){
      try{
        const analysisResponse=await fetch(`/api/projects/${p.id}/product-analyze`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
        if(!analysisResponse.ok){const analysis=await analysisResponse.json().catch(()=>({error:"视觉模型识别失败"}));throw new Error(analysis.error||"视觉模型识别失败")}
        setNotice("产品图已保存，并已自动识别服装类型；请在商品资料中检查分类。");
      }catch(error){setNotice(`产品图已保存；自动服装分类暂未完成：${error instanceof Error?error.message:"未知错误"}。请稍后在商品资料中重试。`)}
    }
    await refresh();return data.url as string;
  }
  async function deleteAsset(key:keyof ProjectAssets,index?:number){const response=await fetch(`/api/projects/${p.id}/assets`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({assetKey:key,index})}),data=await response.json();if(!response.ok)throw new Error(data.error);setP(data)}
  async function clearSourceAssets(){setError("");setNotice("");const response=await fetch(`/api/projects/${p.id}/assets/clear`,{method:"DELETE"}),data=await response.json();if(!response.ok)throw new Error(data.error||"清空素材失败");setP(data.project);setNotice(data.message||"当前任务素材已清空，生成结果已保留");return data.project as Project}
  async function clearWorkflowResults(workflow:"tryon"|"pose"|"recolor"){setError("");setNotice("");const response=await fetch(`/api/projects/${p.id}/results/${workflow}`,{method:"DELETE"}),data=await response.json();if(!response.ok)throw new Error(data.error||"清空结果失败");setP(data.project);setJobs(current=>current.filter(job=>job.workflow!==workflow));setNotice(data.message||"当前模块结果已清空，上传素材已保留");return data.project as Project}
  async function cancelGeneration(workflow:"tryon"|"pose"|"recolor"){setError("");const response=await fetch(`/api/projects/${p.id}/cancel`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workflow})}),data=await response.json();if(!response.ok)throw new Error(data.error||"暂停生图失败");await refresh();setNotice("已暂停当前生图任务")}
  async function clearWorkflowErrors(workflow:"tryon"|"pose"|"recolor"){setError("");const response=await fetch(`/api/projects/${p.id}/errors/${workflow}`,{method:"DELETE"}),data=await response.json();if(!response.ok)throw new Error(data.error||"清空错误内容失败");await refresh();setNotice(data.message||"错误生图内容已清空")}
  async function saveProject(patch:Partial<Project>){const response=await fetch(`/api/projects/${p.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)}),data=await response.json();if(!response.ok)throw new Error(data.error);setP(data);return data}
  async function post(url:string,body:unknown){const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.error);if(!data.jobId)return data;const terminal=new Set(["success","needs_review","needs_redo","confirmed","failed","interrupted"]);for(let attempt=0;attempt<120;attempt++){if(document.visibilityState!=="visible"){await new Promise(resolve=>setTimeout(resolve,2500));continue}const poll=await fetch(`/api/jobs/${data.jobId}`,{cache:"no-store"}),state=await poll.json();if(!poll.ok)throw new Error(state.error||"任务状态查询失败");if(attempt%2===0||terminal.has(state.status))await refresh();if(["success","needs_review","needs_redo","confirmed","interrupted"].includes(state.status))return state;if(state.status==="failed")throw new Error(state.error||"生成任务失败");await new Promise(resolve=>setTimeout(resolve,2500))}throw new Error("本地任务等待超时，请在历史任务中查看并重试")}
  async function enqueue(url:string,body:unknown){const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.error);await refresh();return data}
  const run:Runner=fn=>{setPendingActions(value=>value+1);setError("");void fn().then(refresh).catch(e=>setError(e instanceof Error?e.message:"操作失败")).finally(()=>setPendingActions(value=>Math.max(0,value-1)))};
  async function confirmFlow(workflow:string,images:string[]){await post(`/api/projects/${p.id}/confirm`,{workflow,images});const next=workflow==="tryon"?3:workflow==="pose"?4:5;await refresh();goStep(next)}
  async function complete(){await post(`/api/projects/${p.id}/complete`,{});await refresh()}
  const common:Omit<PanelProps,"jobs">={p,health,modelRouting,busy,run,refreshProject:refresh,persistAsset,deleteAsset,clearSourceAssets,clearWorkflowResults,cancelGeneration,clearWorkflowErrors,saveProject,post,enqueue,confirmFlow};
  return <><ProjectHeader project={p} step={step} onStep={goStep}/>{error&&<div className="error">{error}</div>}{notice&&<div className="notice workspace-notice">{notice}</div>}
    {step===1&&<ProductDetailsPanel p={p} jobs={jobs} busy={busy} run={run} persistAsset={persistAsset} deleteAsset={deleteAsset} clearSourceAssets={clearSourceAssets} saveProject={saveProject} onNext={()=>goStep(2,true)}/>}
    {step===2&&<TryonPanel {...common} jobs={latest("tryon")} historyJobs={jobs.filter(job=>resultWorkflow(job)==="tryon")}/>}
    {step===3&&<PosePanel {...common} jobs={latest("pose")} historyJobs={jobs.filter(job=>resultWorkflow(job)==="pose")}/>}
    {step===4&&<RecolorPanel {...common} jobs={latest("recolor",true)} historyJobs={jobs.filter(job=>resultWorkflow(job)==="recolor")}/>}
    {step===5&&<FinalPanel p={p} jobs={jobs} onStep={goStep} onComplete={complete} post={post}/>}
    <RecentTaskList jobs={jobs}/>
  </>;
}
