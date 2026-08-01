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

export function tryonCompletionPatch(project:Project,status:StepStatus):Partial<Project>{
  if(project.confirmedTryonImage){
    return {stepStatuses:{...project.stepStatuses,"2":"confirmed"}};
  }
  return {
    status:status==="failed"?"生成失败":"等待人工确认",
    stepStatuses:{...project.stepStatuses,"2":status},
  };
}
