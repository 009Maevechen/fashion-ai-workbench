import {NextResponse} from "next/server";
import {getProject,listJobs,patchJob,updateProject} from "@/lib/db";
import {z} from "zod";

const schema=z.object({workflow:z.enum(["tryon","pose","recolor"]),images:z.array(z.string().startsWith("/api/files/")).min(1).max(3)});
const CONFIRMABLE=new Set(["success","needs_review","awaiting_confirmation","confirmed"]);

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id,value=schema.parse(await request.json()),project=await getProject(id);
    if(!project)throw new Error("项目不存在");
    const required=value.workflow==="tryon"?1:3;
    if(value.images.length!==required||new Set(value.images).size!==required)throw new Error(value.workflow==="tryon"?"换装只能确认一张候选图":"必须确认三张不同的结果图");
    const allJobs=await listJobs({projectId:id}),jobs=allJobs.filter(job=>job.workflow===value.workflow);
    const selected=value.images.map(image=>jobs.find(job=>job.outputImages.includes(image)));
    if(selected.some(job=>!job))throw new Error("选择的图片不属于当前工作流任务");
    if(selected.some(job=>!CONFIRMABLE.has(job!.status)||job!.dependencyStatus==="stale"))throw new Error("过期、失败或中断的结果不能确认，请重新生成");
    for(const job of selected)await patchJob(job!.id,{status:"confirmed",dependencyStatus:"current"});

    if(value.workflow==="tryon"){
      const hasPose=Boolean(project.confirmedPoseImages?.length||allJobs.some(job=>job.workflow==="pose"&&job.outputImages.length));
      const hasRecolor=Boolean((project.targetColors||[]).some(color=>color.poseResults?.length));
      return NextResponse.json(await updateProject(id,{confirmedTryonImage:value.images[0],currentStep:Math.max(project.currentStep,3),status:hasPose||hasRecolor?"需要重新审核":"已确认",dependencyStatus:hasPose||hasRecolor?"needs_review":"current",stepStatuses:{...project.stepStatuses,"2":"confirmed","3":hasPose?"stale":"ready","4":hasRecolor?"stale":"not_started","5":hasPose||hasRecolor?"stale":"not_started"}}));
    }
    if(value.workflow==="pose"){
      const hasRecolor=Boolean((project.targetColors||[]).some(color=>color.poseResults?.length));
      return NextResponse.json(await updateProject(id,{confirmedPoseImages:value.images,currentStep:Math.max(project.currentStep,4),status:hasRecolor?"需要重新审核":"已确认",dependencyStatus:hasRecolor?"needs_review":"current",stepStatuses:{...project.stepStatuses,"3":"confirmed","4":hasRecolor?"stale":"ready","5":hasRecolor?"stale":"not_started"}}));
    }
    const targetIds=[...new Set(selected.map(job=>job!.targetColorId))];
    if(targetIds.length!==1||!targetIds[0])throw new Error("三张复色图必须属于同一个目标颜色");
    const colors=(project.targetColors||[]).map(color=>color.id===targetIds[0]?{...color,status:"confirmed" as const,poseResults:value.images}:color);
    return NextResponse.json(await updateProject(id,{confirmedRecolorImages:value.images,currentStep:5,status:"等待最终确认",dependencyStatus:"current",targetColors:colors,stepStatuses:{...project.stepStatuses,"4":"confirmed","5":"ready"}}));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"确认失败"},{status:400})}
}
