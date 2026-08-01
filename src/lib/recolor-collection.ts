import type {Job,Project,TargetColor} from "./db";

const RESULT_STATUSES=new Set(["success","needs_review","confirmed"]);

export function recolorColorsWithSavedJobs(project:Project,jobs:Job[]){
  return (project.targetColors||[]).map(color=>{
    const bySlot=new Map<number,string>();
    for(const [index,url] of (color.poseResults||[]).entries())if(url)bySlot.set(index+1,url);
    const saved=jobs
      .filter(job=>job.workflow==="recolor"&&job.targetColorId===color.id&&RESULT_STATUSES.has(job.status)&&job.outputImages[0])
      .sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
    for(const job of saved)if(job.slot)bySlot.set(job.slot,job.outputImages[0]);
    const poseResults=[...bySlot.entries()].sort(([a],[b])=>a-b).map(([,url])=>url);
    if(!poseResults.length)return color;
    const expected=color.sourceCount||Math.max(...bySlot.keys());
    const status:TargetColor["status"]=poseResults.length>=expected?"success":"partial_success";
    return {...color,status:color.status==="confirmed"?color.status:status,sourceCount:expected,poseResults};
  });
}

export function removeRecolorCollectionImage(project:Project,colorId:string,url:string){
  const color=(project.targetColors||[]).find(item=>item.id===colorId);
  if(!color)throw new Error("颜色不存在");
  if(!color.poseResults?.includes(url))throw new Error("该图片不属于当前颜色集合");
  const remaining=color.poseResults.filter(item=>item!==url);
  const status:TargetColor["status"]=remaining.length?"success":color.cropImage||color.hex?"ready":"draft";
  const targetColors=(project.targetColors||[]).map(item=>item.id===colorId?{...item,poseResults:remaining,status}:item);
  const hasAnyResult=targetColors.some(item=>item.poseResults?.length);
  return {
    targetColors,
    confirmedRecolorImages:(project.confirmedRecolorImages||[]).filter(item=>item!==url),
    status:project.status==="已完成"?"需要重新审核":project.status,
    stepStatuses:{...project.stepStatuses,"4":hasAnyResult?"completed" as const:"ready" as const,"5":hasAnyResult?"ready" as const:"not_started" as const},
  };
}
