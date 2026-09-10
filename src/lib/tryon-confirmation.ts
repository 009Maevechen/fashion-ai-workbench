import type {Job,Project,StepStatus} from "./db";

const MANUALLY_REVIEWABLE_STATUSES=new Set<Job["status"]>([
  "success",
  "needs_review",
  "needs_redo",
  "failed",
  "awaiting_confirmation",
  "confirmed",
]);

export function canManuallyConfirmJob(job:Job|undefined,image?:string){
  return Boolean(
    job
    &&job.outputImages.length>0
    &&(!image||job.outputImages.includes(image))
    &&MANUALLY_REVIEWABLE_STATUSES.has(job.status)
    &&job.dependencyStatus!=="stale"
  );
}

export const canManuallyConfirmTryonJob = canManuallyConfirmJob;

export function canConfirmTryonSelection(selected:string,jobs:Job[]){
  if(!selected)return false;
  const selectedJob=jobs.find(job=>job.outputImages.includes(selected));
  return canManuallyConfirmTryonJob(selectedJob,selected);
}

export function isSameTryonConfirmation(current:string|undefined,next:string){
  return Boolean(current&&current===next);
}

export function tryonSubjectFidelityFailurePatch(){
  return {status:"failed" as const,requestStatus:"failed" as const,errorMessage:"AI 换装质检未通过：结果可能残留参考模特原服装特征、复制/更接近服装产品图中的模特，或皮肤质感画质明显低于参考模特图。建议重新生成；图片仍保留，可由用户人工审核后确认"};
}

export function tryonCompletionPatch(project:Project,status:StepStatus):Partial<Project>{
  if(project.confirmedTryonImage){
    return {stepStatuses:{...project.stepStatuses,"2":"confirmed"}};
  }
  return {
    status:status==="failed"?"生成失败":status==="needs_redo"?"服装细节需要重做":"等待人工确认",
    stepStatuses:{...project.stepStatuses,"2":status},
  };
}

export function resultWorkflow(job: Job) {
  return job.workflow === "inpaint" ? job.inpaint?.sourceStep || job.workflow : job.workflow;
}
