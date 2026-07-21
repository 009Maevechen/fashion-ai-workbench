import "server-only";
import crypto from "node:crypto";
import {addOperation,getOperation,markInterruptedJobs,markInterruptedOperations,patchOperation,reconcileGeneratingProjects,type Operation} from "./db";
import {executePose,executeRecolor,executeTryon} from "./workflow";
import type {WorkflowType} from "./ai/types";

let initialized=false;
export async function initializeJobState(){if(initialized)return;initialized=true;await markInterruptedJobs();await markInterruptedOperations();await reconcileGeneratingProjects()}
async function execute(workflow:WorkflowType,payload:unknown){if(workflow==="tryon")return executeTryon(payload as Parameters<typeof executeTryon>[0]);if(workflow==="pose")return executePose(payload as Parameters<typeof executePose>[0]);return executeRecolor(payload as Parameters<typeof executeRecolor>[0])}
async function run(operation:Operation){try{await patchOperation(operation.id,{status:"running"});const results=await execute(operation.workflow,operation.payload),jobIds=results.flatMap(result=>"id" in result&&typeof result.id==="string"?[result.id]:[]),errors=results.flatMap(result=>"error" in result&&result.error?[String(result.error)]:[]);await patchOperation(operation.id,{status:errors.length===results.length?"failed":"success",jobIds,error:errors.length?errors.join("；"):undefined})}catch(error){await patchOperation(operation.id,{status:"failed",error:error instanceof Error?error.message:"后台任务执行失败"})}}
export async function enqueueWorkflow(workflow:WorkflowType,payload:{projectId:string}){await initializeJobState();const now=new Date().toISOString(),operation:Operation={id:crypto.randomUUID(),projectId:payload.projectId,workflow,status:"queued",payload,jobIds:[],createdAt:now,updatedAt:now};await addOperation(operation);setTimeout(()=>{void run(operation)},0);return operation}
export async function retryOperation(id:string){const operation=await getOperation(id);if(!operation)throw new Error("本地任务不存在");if(operation.status==="queued"||operation.status==="running")throw new Error("任务仍在执行中");return enqueueWorkflow(operation.workflow,operation.payload as {projectId:string})}
