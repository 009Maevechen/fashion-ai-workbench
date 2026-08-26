import { NextResponse } from "next/server";
import { getJob, getProject, patchJob } from "@/lib/db";
import { checkGarmentConsistency } from "@/lib/ai/garment-consistency";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const project=await getProject((await params).id),body=await request.json() as {jobId?:string};
    if(!project)throw new Error("商品项目不存在");
    if(!body.jobId)throw new Error("缺少需要检测的生成任务");
    const job=await getJob(body.jobId);
    if(!job||job.projectId!==project.id)throw new Error("生成任务不存在或不属于当前项目");
    const result=await checkGarmentConsistency(project,job);
    await patchJob(job.id,{consistencyCheck:result});
    return NextResponse.json({result});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"AI服装一致性检测失败"},{status:400});
  }
}
