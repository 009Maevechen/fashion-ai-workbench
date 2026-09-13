import type {Job,Project,StepStatus,TargetColor} from "./db";
import type {WorkflowType} from "./ai/types";

export function hasWorkflowResults(project:Project,jobs:Job[],workflow:WorkflowType){
  if(jobs.some(job=>job.workflow===workflow&&job.outputImages.length>0))return true;
  if(workflow==="tryon")return Boolean(project.confirmedTryonImage);
  if(workflow==="pose")return Boolean(project.confirmedPoseImages?.length);
  return Boolean(project.confirmedRecolorImages?.length||(project.targetColors||[]).some(color=>color.poseResults?.length));
}

export function prepareResultCleanup(project:Project,jobs:Job[],workflow:WorkflowType){
  const urls=jobs.filter(job=>job.workflow===workflow).flatMap(job=>job.outputImages);
  const stepStatuses={...(project.stepStatuses||{})};
  const patch:Partial<Project>={};
  if(workflow==="tryon"){
    if(project.confirmedTryonImage)urls.push(project.confirmedTryonImage);
    patch.confirmedTryonImage=undefined;
    patch.currentStep=Math.min(project.currentStep,2);
    stepStatuses["2"]="ready";
    if(project.confirmedPoseImages?.length||(project.targetColors||[]).some(color=>color.poseResults?.length)){stepStatuses["3"]="stale";stepStatuses["4"]="stale";stepStatuses["5"]="stale";patch.status="需要重新审核";patch.dependencyStatus="needs_review"}else patch.status="未开始";
  }else if(workflow==="pose"){
    urls.push(...(project.confirmedPoseImages||[]));
    patch.confirmedPoseImages=undefined;
    patch.currentStep=Math.min(project.currentStep,3);
    stepStatuses["3"]="ready";
    if((project.targetColors||[]).some(color=>color.poseResults?.length)){stepStatuses["4"]="stale";stepStatuses["5"]="stale";patch.status="需要重新审核";patch.dependencyStatus="needs_review"}else patch.status="未开始";
  }else{
    urls.push(...(project.confirmedRecolorImages||[]));
    const targetColors=(project.targetColors||[]).map(color=>{urls.push(...(color.poseResults||[]),...(color.confirmedPoseResults||[]));const next:TargetColor={...color};delete next.poseResults;delete next.confirmedPoseResults;next.status=color.cropImage||color.hex?"ready":"draft";return next});
    patch.confirmedRecolorImages=undefined;
    patch.targetColors=targetColors;
    patch.currentStep=Math.min(project.currentStep,4);
    stepStatuses["4"]="ready";stepStatuses["5"]="not_started";patch.status="未开始";
  }
  patch.stepStatuses=stepStatuses as Record<string,StepStatus>;
  return {patch,urls:[...new Set(urls)]};
}
