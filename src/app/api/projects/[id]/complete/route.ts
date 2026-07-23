import {NextResponse} from "next/server";
import {getProject,listJobs,updateProject} from "@/lib/db";
import {duplicateColorNames,isColorSetComplete} from "@/lib/color-sets";
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id,project=await getProject(id);if(!project)throw new Error("项目不存在");
    if(!project.confirmedTryonImage)throw new Error("尚未确认换装结果");
    if(project.confirmedPoseImages?.length!==3)throw new Error("尚未确认三张姿势图");
    const colors=project.targetColors||[];if(!colors.length)throw new Error("尚未建立任何颜色套装");
    if(duplicateColorNames(colors).size)throw new Error("存在重复颜色名称，请先修改");
    if(!colors.every(isColorSetComplete))throw new Error("每一款颜色都必须命名、生成三张复色图并完成确认");
    const latest=new Map<string,(Awaited<ReturnType<typeof listJobs>>)[number]>();for(const job of await listJobs({projectId:id})){const key=`${job.workflow}:${job.targetColorId||""}:${job.slot||0}`;if(!latest.has(key))latest.set(key,job)}
    if([...latest.values()].some(job=>["failed","needs_review","stale","interrupted"].includes(job.status)))throw new Error("最新任务中仍有失败、待审核或过期结果");
    return NextResponse.json(await updateProject(id,{status:"已完成",dependencyStatus:"current",stepStatuses:{...project.stepStatuses,"5":"completed"}}));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"无法完成项目"},{status:400})}
}
