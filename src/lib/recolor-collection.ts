import type {Job,Project,TargetColor} from "./db";

import {canManuallyConfirmJob,resultWorkflow} from "./tryon-confirmation";

export function confirmedColorResults(color:TargetColor){
  if(color.confirmedPoseResults)return color.confirmedPoseResults;
  // 兼容旧项目：旧版本只有整套确认，确认后 poseResults 即为人工确认结果。
  return color.status==="confirmed"?(color.poseResults||[]):[];
}

export function mergeConfirmedColorResults(
  color:TargetColor,
  selections:Array<{slot:number;url:string}>,
){
  const expected=color.sourceCount||3;
  const confirmed=Array.from({length:expected},(_,index)=>confirmedColorResults(color)[index]||"");
  for(const {slot,url} of selections){
    if(slot<1||slot>expected)throw new Error(`姿势位置 ${slot} 不在当前颜色套装范围内`);
    confirmed[slot-1]=url;
  }
  return confirmed;
}

export function confirmedRecolorImagesFor(colors:TargetColor[]){
  return [...new Set(colors.flatMap(confirmedColorResults).filter(Boolean))];
}

export function recolorColorsWithSavedJobs(project:Project,jobs:Job[]){
  return (project.targetColors||[]).map(color=>{
    const bySlot=new Map<number,string>();
    for(const [index,url] of (color.poseResults||[]).entries())if(url)bySlot.set(index+1,url);
    const saved=jobs
      .filter(job=>resultWorkflow(job)==="recolor"&&job.targetColorId===color.id&&canManuallyConfirmJob(job))
      .sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
    for(const job of saved)if(job.slot)bySlot.set(job.slot,job.outputImages[0]);
    const poseResults=[...bySlot.entries()].sort(([a],[b])=>a-b).map(([,url])=>url);
    if(!poseResults.length)return color;
    const expected=color.sourceCount||Math.max(...bySlot.keys());
    const status:TargetColor["status"]=poseResults.length>=expected?"success":"partial_success";
    return {...color,status,sourceCount:expected,poseResults};
  });
}

export function removeRecolorCollectionImage(project:Project,colorId:string,url:string){
  const color=(project.targetColors||[]).find(item=>item.id===colorId);
  if(!color)throw new Error("颜色不存在");
  if(!color.poseResults?.includes(url))throw new Error("该图片不属于当前颜色集合");
  const remaining=color.poseResults.filter(item=>item!==url);
  const status:TargetColor["status"]=remaining.length?"success":color.cropImage||color.hex?"ready":"draft";
  const targetColors=(project.targetColors||[]).map(item=>{
    if(item.id!==colorId)return item;
    const confirmedPoseResults=confirmedColorResults(item).map(value=>value===url?"":value);
    return {...item,poseResults:remaining,confirmedPoseResults,status};
  });
  const hasAnyResult=targetColors.some(item=>item.poseResults?.length);
  return {
    targetColors,
    confirmedRecolorImages:confirmedRecolorImagesFor(targetColors),
    status:project.status==="已完成"?"需要重新审核":project.status,
    stepStatuses:{...project.stepStatuses,"4":hasAnyResult?"completed" as const:"ready" as const,"5":hasAnyResult?"ready" as const:"not_started" as const},
  };
}
