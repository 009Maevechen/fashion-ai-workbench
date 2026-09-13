import "server-only";
import crypto from "node:crypto";
import {addOperation,cancelWorkflowGeneration,getJob,getOperation,listOperations,markInterruptedJobs,markInterruptedOperations,patchOperation,reconcileGeneratingProjects,type Operation} from "./db";
import type {ModelSlot} from "./ai/provider-settings-types";
import {executeInpaint,executePose,executeRecolor,executeTryon} from "./workflow";
import {refineCorrectionRequest} from "./ai/correction-refine";
import type {CorrectionCommandPlan} from "./correction-command";
import {normalizeCorrectionCommandPlan} from "./correction-command";
import type {WorkflowType} from "./ai/types";
import {clearGenerationCancellation,isGenerationCancelled,markGenerationCancelled} from "./generation-cancel";

type JobRuntimeGlobal=typeof globalThis&{
  __workbenchJobStateInitialization?:Promise<void>;
  __workbenchOperationQueue?:Operation[];
  __workbenchActiveOperationCount?:number;
  __workbenchEnqueueTail?:Promise<void>;
};
const jobRuntime=globalThis as JobRuntimeGlobal;
// 一次只展开一个完整工作流。单个工作流本身可能包含 2 至 4 张大图，
// Windows 上再并行多个工作流会让 Node、Sharp 和 Electron 同时争抢内存。
const MAX_CONCURRENT_GENERATIONS=1;
function activeOperationScope(workflow:WorkflowType,payload:Record<string,unknown>){
  if(workflow==="recolor")return `${workflow}:${String(payload.targetColorId||payload.colorName||"unscoped").trim().toLocaleLowerCase("zh-CN")}`;
  if(workflow==="inpaint")return `${workflow}:${String(payload.sourceImageId||payload.sourceImage||payload.maskImage||"unscoped")}`;
  // 换装和三姿势一次操作就是当前项目的一整组生成。跨标签页重复点击时
  // 必须复用正在运行的操作，不能再排一组相同的上游 API 调用。
  return workflow;
}
export async function initializeJobState(){
  if(!jobRuntime.__workbenchJobStateInitialization){
    jobRuntime.__workbenchJobStateInitialization=(async()=>{await markInterruptedJobs();await markInterruptedOperations();await reconcileGeneratingProjects()})().catch(error=>{delete jobRuntime.__workbenchJobStateInitialization;throw error});
  }
  await jobRuntime.__workbenchJobStateInitialization;
}
async function execute(workflow:WorkflowType,payload:unknown){if(workflow==="tryon")return executeTryon(payload as Parameters<typeof executeTryon>[0]);if(workflow==="pose")return executePose(payload as Parameters<typeof executePose>[0]);if(workflow==="inpaint")return executeInpaint(payload as Parameters<typeof executeInpaint>[0]);return executeRecolor(payload as Parameters<typeof executeRecolor>[0])}
async function run(operation:Operation){try{await patchOperation(operation.id,{status:"running"});const results=await execute(operation.workflow,operation.payload);if(isGenerationCancelled(operation.projectId,operation.workflow)){await patchOperation(operation.id,{status:"interrupted",error:"任务已被用户取消"});return}const jobIds=results.flatMap(result=>"id" in result&&typeof result.id==="string"?[result.id]:[]),errors=results.flatMap(result=>"error" in result&&result.error?[String(result.error)]:[]);await patchOperation(operation.id,{status:errors.length===results.length?"failed":"success",jobIds,error:errors.length?errors.join("；"):undefined})}catch(error){if(isGenerationCancelled(operation.projectId,operation.workflow)){await patchOperation(operation.id,{status:"interrupted",error:"任务已被用户取消"});return}await patchOperation(operation.id,{status:"failed",error:error instanceof Error?error.message:"后台任务执行失败"})}}
function drainOperationQueue(){
  const queue=jobRuntime.__workbenchOperationQueue??=[];
  jobRuntime.__workbenchOperationQueue=queue;
  jobRuntime.__workbenchActiveOperationCount??=0;
  while(jobRuntime.__workbenchActiveOperationCount<MAX_CONCURRENT_GENERATIONS&&queue.length){
    const operation=queue.shift()!;
    jobRuntime.__workbenchActiveOperationCount++;
    void run(operation).finally(()=>{jobRuntime.__workbenchActiveOperationCount=Math.max(0,(jobRuntime.__workbenchActiveOperationCount||1)-1);drainOperationQueue()});
  }
}
function schedule(operation:Operation){
  const queue=jobRuntime.__workbenchOperationQueue??=[];
  jobRuntime.__workbenchOperationQueue=queue;
  queue.push(operation);
  drainOperationQueue();
}
async function serializeEnqueue<T>(work:()=>Promise<T>){const previous=jobRuntime.__workbenchEnqueueTail||Promise.resolve();let release!:()=>void;jobRuntime.__workbenchEnqueueTail=new Promise<void>(resolve=>{release=resolve});await previous.catch(()=>{});try{return await work()}finally{release()}}
export async function enqueueWorkflow(workflow:WorkflowType,payload:{projectId:string},idempotencyKey?:string){await initializeJobState();return serializeEnqueue(async()=>{clearGenerationCancellation(payload.projectId,workflow);const now=new Date().toISOString();
    const existing=await listOperations(payload.projectId);
    // 第一层：显式幂等键可安全复用已成功请求。
    if(idempotencyKey){const dup=existing.find(item=>item.workflow===workflow&&item.payload&&(item.payload as Record<string,unknown>).idempotencyKey===idempotencyKey&&["queued","running","success"].includes(item.status));if(dup)return dup}
    // 第二层：浏览器多标签页、双击或网络重发没有共享前端 busy 状态，服务端仍要
    // 按项目+业务范围拦住重复活动操作。不同复色款仍保留各自独立范围。
    const scope=activeOperationScope(workflow,payload as Record<string,unknown>),active=existing.find(item=>item.workflow===workflow&&["queued","running"].includes(item.status)&&activeOperationScope(workflow,(item.payload||{}) as Record<string,unknown>)===scope);
    if(active)return active;
    const operation:Operation={id:crypto.randomUUID(),projectId:payload.projectId,workflow,status:"queued",payload:{...payload,idempotencyKey:idempotencyKey||crypto.randomUUID()},jobIds:[],createdAt:now,updatedAt:now};await addOperation(operation);schedule(operation);return operation
  })}
// 暂停某个项目工作流的生图：标记取消、中断未完成任务、从内存队列移除排队操作并对账项目状态。
export async function cancelGeneration(projectId:string,workflow:WorkflowType){await initializeJobState();markGenerationCancelled(projectId,workflow);await cancelWorkflowGeneration(projectId,workflow);const queue=jobRuntime.__workbenchOperationQueue;if(queue){jobRuntime.__workbenchOperationQueue=queue.filter(operation=>!(operation.projectId===projectId&&operation.workflow===workflow))}return {cancelled:true}}
export async function retryOperation(id:string){const operation=await getOperation(id);if(!operation)throw new Error("本地任务不存在");if(operation.status==="queued"||operation.status==="running")throw new Error("任务仍在执行中");return enqueueWorkflow(operation.workflow,operation.payload as {projectId:string})}
export async function retryJob(id:string,modelPreference:ModelSlot="primary",correctionRequest?:string,confirmedPlan?:CorrectionCommandPlan){
  const job=await getJob(id);if(!job)throw new Error("生成任务不存在");
  if(job.phase&&!["success","failed","interrupted"].includes(job.phase))throw new Error("任务仍在执行中");
  const operations=await listOperations(job.projectId),operation=operations.find(item=>item.jobIds.includes(id));
  if(!operation)throw new Error("找不到该任务的原始请求，无法安全重试");
  const payload:Record<string,unknown>={...(operation.payload as Record<string,unknown>),slot:job.slot,modelPreference};
  payload.mode="quality";
  payload.correctionQualityBaseline=job.correctionQualityBaseline||job.outputImages[0]||job.inputImages[0];
  const correction=correctionRequest?.trim();
  if(correction&&!job.outputImages[0])throw new Error("没有已保存的生成结果，无法执行咒语修改，请先重新生成");
  if(correction){
    payload.correctionRequest=correction;
    // 咒语修改一律使用精细模式；连续修改始终继承第一次修改前的图片作为
    // 质量基线，不能一代接一代逐步变糊。
    payload.mode="quality";
    const plan=confirmedPlan?normalizeCorrectionCommandPlan(confirmedPlan,correction):await refineCorrectionRequest(correction);
    payload.correctionPlan=plan;
    if(job.workflow==="inpaint"){
      payload.sourceUrl=job.outputImages[0];
      payload.sourceImageId=job.id;
      payload.editPrompt=correction;
    }else if(job.workflow==="tryon"){
      payload.modelImage=job.outputImages[0];
    }else if(job.workflow==="pose"){
      payload.sourceImage=job.outputImages[0];
    }else{
      // 复色纠正仍从同一张已确认姿势 master 独立生成，禁止把上一张
      // 复色候选继续当源图，避免颜色和画质逐代累积偏移。
      delete payload.sourceOverride;
    }
  }
  return enqueueWorkflow(job.workflow,payload as unknown as {projectId:string});
}
