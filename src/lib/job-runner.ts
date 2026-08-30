import "server-only";
import crypto from "node:crypto";
import {addOperation,getJob,getOperation,listOperations,markInterruptedJobs,markInterruptedOperations,patchOperation,reconcileGeneratingProjects,type Operation} from "./db";
import type {ModelSlot} from "./ai/provider-settings-types";
import {executePose,executeRecolor,executeTryon} from "./workflow";
import {refineCorrectionRequest} from "./ai/correction-refine";
import type {WorkflowType} from "./ai/types";

type JobRuntimeGlobal=typeof globalThis&{
  __workbenchJobStateInitialization?:Promise<void>;
  __workbenchOperationQueue?:Operation[];
  __workbenchActiveOperationCount?:number;
};
const jobRuntime=globalThis as JobRuntimeGlobal;
const MAX_CONCURRENT_GENERATIONS=2;
export async function initializeJobState(){
  if(!jobRuntime.__workbenchJobStateInitialization){
    jobRuntime.__workbenchJobStateInitialization=(async()=>{await markInterruptedJobs();await markInterruptedOperations();await reconcileGeneratingProjects()})().catch(error=>{delete jobRuntime.__workbenchJobStateInitialization;throw error});
  }
  await jobRuntime.__workbenchJobStateInitialization;
}
async function execute(workflow:WorkflowType,payload:unknown){if(workflow==="tryon")return executeTryon(payload as Parameters<typeof executeTryon>[0]);if(workflow==="pose")return executePose(payload as Parameters<typeof executePose>[0]);return executeRecolor(payload as Parameters<typeof executeRecolor>[0])}
async function run(operation:Operation){try{await patchOperation(operation.id,{status:"running"});const results=await execute(operation.workflow,operation.payload),jobIds=results.flatMap(result=>"id" in result&&typeof result.id==="string"?[result.id]:[]),errors=results.flatMap(result=>"error" in result&&result.error?[String(result.error)]:[]);await patchOperation(operation.id,{status:errors.length===results.length?"failed":"success",jobIds,error:errors.length?errors.join("；"):undefined})}catch(error){await patchOperation(operation.id,{status:"failed",error:error instanceof Error?error.message:"后台任务执行失败"})}}
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
export async function enqueueWorkflow(workflow:WorkflowType,payload:{projectId:string},idempotencyKey?:string){await initializeJobState();const now=new Date().toISOString();
  // 幂等保护：相同幂等键或相同工作流+slot 且仍在进行中时，直接返回已有任务，禁止重复调用 API。
  if(idempotencyKey){const existing=await listOperations(payload.projectId);const dup=existing.find(item=>item.workflow===workflow&&item.payload&&(item.payload as Record<string,unknown>).idempotencyKey===idempotencyKey&&["queued","running","success"].includes(item.status));if(dup)return dup}
  const operation:Operation={id:crypto.randomUUID(),projectId:payload.projectId,workflow,status:"queued",payload:{...payload,idempotencyKey:idempotencyKey||crypto.randomUUID()},jobIds:[],createdAt:now,updatedAt:now};await addOperation(operation);schedule(operation);return operation}
export async function retryOperation(id:string){const operation=await getOperation(id);if(!operation)throw new Error("本地任务不存在");if(operation.status==="queued"||operation.status==="running")throw new Error("任务仍在执行中");return enqueueWorkflow(operation.workflow,operation.payload as {projectId:string})}
export async function retryJob(id:string,modelPreference:ModelSlot="primary",correctionRequest?:string){
  const job=await getJob(id);if(!job)throw new Error("生成任务不存在");
  if(job.phase&&!["success","failed","interrupted"].includes(job.phase))throw new Error("任务仍在执行中");
  const operations=await listOperations(job.projectId),operation=operations.find(item=>item.jobIds.includes(id));
  if(!operation)throw new Error("找不到该任务的原始请求，无法安全重试");
  const payload:Record<string,unknown>={...(operation.payload as Record<string,unknown>),slot:job.slot,modelPreference};
  const correction=correctionRequest?.trim();
  if(correction){
    payload.correctionRequest=correction;
    const refined=await refineCorrectionRequest(correction);
    const lock=`\n本次咒语矫正：${refined}\n只修正上述明确问题；其余人物、姿势、构图、背景、服装类型、版型、长度、颜色、材质、面料、纹理、垂感和全部设计细节必须保持不变。`;
    if(job.workflow==="tryon"){
      payload.modelImage=job.outputImages[0];
      payload.detailRequirements=`${String(payload.detailRequirements||"")}${lock}`;
      // extraRequirements 上限 800，只承载用户原始补充要求，绝不能追加矫正指令；
      // 否则会污染项目设置，下次开始换装时因超长触发 zod 校验失败。
    }else if(job.workflow==="pose"){
      payload.sourceImage=job.outputImages[0];
      payload.detailRequirements=`${String(payload.detailRequirements||"")}${lock}`;
    }else{
      const sources=Array.isArray(payload.poseImages)?[...payload.poseImages as string[]]:[];
      if(job.slot&&job.outputImages[0])sources[job.slot-1]=job.outputImages[0];
      if(sources.length)payload.poseImages=sources;
      payload.extraRequirements=`${String(payload.extraRequirements||"")}${lock}`;
    }
  }
  return enqueueWorkflow(job.workflow,payload as unknown as {projectId:string});
}
