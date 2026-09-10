import {NextResponse} from "next/server";
import {getProject,listJobs,patchJob,updateProject} from "@/lib/db";
import {duplicateColorNames,normalizedColorName} from "@/lib/color-sets";
import {canManuallyConfirmJob,isSameTryonConfirmation,resultWorkflow} from "@/lib/tryon-confirmation";
import {z} from "zod";

const schema=z.object({workflow:z.enum(["tryon","pose","recolor"]),images:z.array(z.string().startsWith("/api/files/")).min(1).max(4)});
const CONFIRMABLE=new Set(["success","needs_review","awaiting_confirmation","confirmed"]);

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id,value=schema.parse(await request.json()),project=await getProject(id);
    if(!project)throw new Error("项目不存在");
    if(value.workflow==="tryon"&&value.images.length!==1)throw new Error("换装只能确认一张候选图");
    if(value.workflow==="pose"&&(value.images.length<2||value.images.length>3))throw new Error("必须确认两张或三张不同的结果图");
    if(new Set(value.images).size!==value.images.length)throw new Error("不能重复选择同一张结果图");
    const allJobs=await listJobs({projectId:id}),jobs=allJobs.filter(job=>resultWorkflow(job)===value.workflow);
    const selected=value.images.map(image=>jobs.find(job=>job.outputImages.includes(image)));
    if(selected.some(job=>!job))throw new Error("选择的图片不属于当前工作流任务");
    if(selected.some((job,index)=>!canManuallyConfirmJob(job,value.images[index])))throw new Error("只有已生成并保存、且未过期的图片可以人工确认");
    async function confirmSelected(){
      for(const job of selected){
        const manuallyOverrodeAiReview=!CONFIRMABLE.has(job!.status);
        await patchJob(job!.id,{
          status:"confirmed",
          dependencyStatus:"current",
          ...(manuallyOverrodeAiReview?{qualityIssues:[...new Set([...(job!.qualityIssues||[]),"用户已人工审核并确认；AI 质检结论仅作参考"])]}:{}),
        });
      }
    }

    if(value.workflow==="tryon"){
      await confirmSelected();
      if(isSameTryonConfirmation(project.confirmedTryonImage,value.images[0])){
        return NextResponse.json(await updateProject(id,{currentStep:Math.max(project.currentStep,3),stepStatuses:{...project.stepStatuses,"2":"confirmed"}}));
      }
      const hasPose=Boolean(project.confirmedPoseImages?.length||allJobs.some(job=>job.workflow==="pose"&&job.outputImages.length));
      const hasRecolor=Boolean((project.targetColors||[]).some(color=>color.poseResults?.length));
      return NextResponse.json(await updateProject(id,{confirmedTryonImage:value.images[0],currentStep:Math.max(project.currentStep,3),status:hasPose||hasRecolor?"需要重新审核":"已确认",dependencyStatus:hasPose||hasRecolor?"needs_review":"current",stepStatuses:{...project.stepStatuses,"2":"confirmed","3":hasPose?"stale":"ready","4":hasRecolor?"stale":"not_started","5":hasPose||hasRecolor?"stale":"not_started"}}));
    }
    if(value.workflow==="pose"){
      const selectedSlots=selected.map(job=>job!.slot).filter((slot):slot is number=>Boolean(slot));
      if(new Set(selectedSlots).size!==value.images.length)throw new Error("每个姿势位置只能确认一张结果图");
      if(selectedSlots.some(slot=>project.poseReviewStates?.[String(slot)]!=="approved"))throw new Error("选中的姿势结果必须逐张人工审核通过后才能确认");
      await confirmSelected();
      const hasRecolor=Boolean((project.targetColors||[]).some(color=>color.poseResults?.length));
      return NextResponse.json(await updateProject(id,{confirmedPoseImages:value.images,currentStep:Math.max(project.currentStep,4),status:hasRecolor?"需要重新审核":"已确认",dependencyStatus:hasRecolor?"needs_review":"current",stepStatuses:{...project.stepStatuses,"3":"confirmed","4":hasRecolor?"stale":"ready","5":hasRecolor?"stale":"not_started"}}));
    }
    const targetIds=[...new Set(selected.map(job=>job!.targetColorId))];
    if(targetIds.length!==1||!targetIds[0])throw new Error("三张复色图必须属于同一个目标颜色");
    const targetColor=(project.targetColors||[]).find(color=>color.id===targetIds[0]);
    if(!targetColor||!normalizedColorName(targetColor))throw new Error("请先为当前颜色命名，再确认这一套复色结果");
    const expected=targetColor.sourceCount||3;
    if(value.images.length!==expected)throw new Error(`当前颜色套装需要确认 ${expected} 张复色结果`);
    if(new Set(selected.map(job=>job!.slot)).size!==expected)throw new Error("每个姿势位置只能确认一张复色结果");
    if(duplicateColorNames(project.targetColors||[]).has(normalizedColorName(targetColor).toLocaleLowerCase("zh-CN")))throw new Error("颜色名称不能重复，请先修改名称");
    await confirmSelected();
    const colors=(project.targetColors||[]).map(color=>color.id===targetIds[0]?{...color,status:"confirmed" as const,poseResults:value.images}:color);
    return NextResponse.json(await updateProject(id,{confirmedRecolorImages:value.images,currentStep:5,status:"等待最终确认",dependencyStatus:"current",targetColors:colors,stepStatuses:{...project.stepStatuses,"4":"confirmed","5":"ready"}}));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"确认失败"},{status:400})}
}
