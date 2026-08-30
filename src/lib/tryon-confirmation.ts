import type {Job,Project,StepStatus} from "./db";

const CONFIRMABLE_STATUSES=new Set<Job["status"]>([
  "success",
  "needs_review",
  "awaiting_confirmation",
  "confirmed",
]);

export function canConfirmTryonSelection(selected:string,jobs:Job[]){
  if(!selected)return false;
  const selectedJob=jobs.find(job=>job.outputImages.includes(selected));
  return Boolean(
    selectedJob
    &&CONFIRMABLE_STATUSES.has(selectedJob.status)
    &&selectedJob.dependencyStatus!=="stale"
  );
}

export function isSameTryonConfirmation(current:string|undefined,next:string){
  return Boolean(current&&current===next);
}

export function tryonSubjectFidelityFailurePatch(){
  return {status:"failed" as const,requestStatus:"failed" as const,errorMessage:"换装主体错误：结果复制或更接近服装产品图中的模特，已禁止确认。请重新生成"};
}

export function tryonCompletionPatch(project:Project,status:StepStatus):Partial<Project>{
  if(project.confirmedTryonImage){
    return {stepStatuses:{...project.stepStatuses,"2":"confirmed"}};
  }
  return {
    status:status==="failed"?"生成失败":"等待人工确认",
    stepStatuses:{...project.stepStatuses,"2":status},
  };
}
