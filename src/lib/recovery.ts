import type {Job,Operation,Project} from "./db";

export function interruptJobs(jobs:Job[],now=new Date().toISOString()){
  let count=0;
  for(const job of jobs)if(job.phase&&!["success","failed","interrupted"].includes(job.phase)){
    job.phase="interrupted";job.status="interrupted";job.requestStatus="interrupted";
    job.error="服务重启导致任务中断；项目与已生成图片已保留，请确认后手动重试";job.errorMessage=job.error;job.finishedAt=now;count++;
  }
  return count;
}

export function interruptOperations(operations:Operation[],now=new Date().toISOString()){
  let count=0;
  for(const operation of operations)if(operation.status==="queued"||operation.status==="running"){
    operation.status="interrupted";operation.error="服务重启导致任务中断；不会自动重新调用 API，请手动决定是否重试";operation.updatedAt=now;count++;
  }
  return count;
}

export function reconcileProjects(projects:Project[],operations:Operation[],now=new Date().toISOString()){
  let count=0;
  for(const project of projects){const active=operations.some(operation=>operation.projectId===project.id&&(operation.status==="queued"||operation.status==="running"));if(active)continue;const statuses=project.stepStatuses||{};if(project.status==="生成中"||Object.values(statuses).includes("generating")){project.status="生成失败";project.stepStatuses=Object.fromEntries(Object.entries(statuses).map(([step,status])=>[step,status==="generating"?"failed":status]));project.targetColors=(project.targetColors||[]).map(color=>color.status==="generating"?{...color,status:"failed"}:color);project.updatedAt=now;count++}}
  return count;
}
