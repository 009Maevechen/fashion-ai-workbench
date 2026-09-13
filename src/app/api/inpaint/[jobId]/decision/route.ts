import {NextResponse} from "next/server";
import {z} from "zod";
import {getJob,getProject,listJobs,patchJob,updateProject} from "@/lib/db";
import {assertFormalImageSource,imageSourceVersions} from "@/lib/image-sources";
import {confirmedRecolorImagesFor,mergeConfirmedColorResults} from "@/lib/recolor-collection";

const schema=z.object({action:z.enum(["accept","keep_source"])});

export async function POST(request:Request,{params}:{params:Promise<{jobId:string}>}){
  try{
    const {jobId}=await params,{action}=schema.parse(await request.json()),job=await getJob(jobId);
    if(!job||job.workflow!=="inpaint"||!job.inpaint)throw new Error("局部重绘候选不存在");
    const project=await getProject(job.projectId),candidate=job.outputImages[0];
    if(!project||!candidate)throw new Error("局部重绘候选尚未保存");
    assertFormalImageSource(candidate,"局部重绘候选");
    if(action==="keep_source"){
      await patchJob(job.id,{inpaint:{...job.inpaint,decision:"kept_source"}});
      return NextResponse.json({project,job:{...job,inpaint:{...job.inpaint,decision:"kept_source"}}});
    }
    await patchJob(job.id,{status:"confirmed",dependencyStatus:"current",inpaint:{...job.inpaint,decision:"accepted"},outputImageVersions:[imageSourceVersions(candidate,candidate)]});
    const allJobs=await listJobs({projectId:project.id}),sourceStep=job.inpaint.sourceStep;
    if(sourceStep==="tryon"){
      for(const item of allJobs)if(["pose","recolor"].includes(item.workflow)&&!["failed","stale"].includes(item.status))await patchJob(item.id,{status:"stale",dependencyStatus:"stale"});
      const next=await updateProject(project.id,{confirmedTryonImage:candidate,status:"需要重新审核",dependencyStatus:"needs_review",stepStatuses:{...project.stepStatuses,"2":"confirmed","3":"stale","4":"stale","5":"stale"}});
      return NextResponse.json({project:next});
    }
    if(sourceStep==="pose"){
      const images=[...(project.confirmedPoseImages||[])],sourceIndex=images.indexOf(job.inpaint.sourceUrl),index=sourceIndex>=0?sourceIndex:Math.max(0,(job.slot||1)-1);
      images[index]=candidate;
      for(const item of allJobs)if(item.workflow==="recolor"&&!["failed","stale"].includes(item.status))await patchJob(item.id,{status:"stale",dependencyStatus:"stale"});
      const colors=(project.targetColors||[]).map(color=>color.poseResults?.length?{...color,status:"stale" as const}:color);
      const next=await updateProject(project.id,{confirmedPoseImages:images,targetColors:colors,status:"需要重新审核",dependencyStatus:"needs_review",stepStatuses:{...project.stepStatuses,"3":"confirmed","4":"stale","5":"stale"}});
      return NextResponse.json({project:next});
    }
    if(sourceStep==="recolor"){
      const color=(project.targetColors||[]).find(item=>item.id===job.targetColorId);
      if(!color)throw new Error("找不到候选所属颜色款");
      const confirmedPoseResults=mergeConfirmedColorResults(color,[{slot:job.slot||1,url:candidate}]);
      const colors=(project.targetColors||[]).map(item=>item.id===color.id?{...item,confirmedPoseResults,status:confirmedPoseResults.filter(Boolean).length>=(item.sourceCount||3)?"confirmed" as const:"partial_success" as const}:item);
      const next=await updateProject(project.id,{targetColors:colors,confirmedRecolorImages:confirmedRecolorImagesFor(colors),status:"等待最终确认",dependencyStatus:"current",stepStatuses:{...project.stepStatuses,"4":"confirmed","5":"ready"}});
      return NextResponse.json({project:next});
    }
    throw new Error("当前候选缺少可替换的正式工作流来源");
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"局部重绘确认失败"},{status:400})}
}
