import {NextResponse} from "next/server";
import {getProject,listJobs,updateProject} from "@/lib/db";
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id,project=await getProject(id);if(!project)throw new Error("项目不存在");
    if(!project.confirmedTryonImage)throw new Error("尚未确认换装结果");
    if(project.confirmedPoseImages?.length!==3)throw new Error("尚未确认三张姿势图");
    if(!(project.targetColors||[]).some(c=>c.status==="confirmed"&&c.poseResults?.length===3))throw new Error("至少需要确认一套复色结果");
    if((project.targetColors||[]).some(c=>c.status==="stale"))throw new Error("仍有过期的复色套装");
    const latest=new Map<string,(Awaited<ReturnType<typeof listJobs>>)[number]>();for(const job of await listJobs({projectId:id})){const key=`${job.workflow}:${job.targetColorId||""}:${job.slot||0}`;if(!latest.has(key))latest.set(key,job)}
    if([...latest.values()].some(job=>["failed","needs_review","stale","interrupted"].includes(job.status)))throw new Error("最新任务中仍有失败、待审核或过期结果");
    return NextResponse.json(await updateProject(id,{status:"已完成",dependencyStatus:"current",stepStatuses:{...project.stepStatuses,"5":"completed"}}));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"无法完成项目"},{status:400})}
}
