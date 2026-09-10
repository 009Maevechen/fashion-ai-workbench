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
    const label=job.workflow==="tryon"?"换装细节校验":job.workflow==="recolor"?"复色校验":"服装校验";
    const issues=result.status==="passed"?job.qualityIssues:[...(job.qualityIssues||[]),...result.issues.map(issue=>`${label}：${issue}`)];
    const blocking=result.status==="failed"||result.status==="needs_redo";
    await patchJob(job.id,{consistencyCheck:result,...(job.workflow==="tryon"&&blocking?{status:"needs_redo",requestStatus:"needs_redo",phase:"success",errorMessage:`${label}未通过：${result.summary}`,qualityIssues:issues}:job.workflow==="tryon"&&result.status==="needs_review"?{status:"needs_review",requestStatus:"needs_review",qualityIssues:issues}:job.workflow==="recolor"&&result.status==="failed"?{status:"failed",requestStatus:"failed",phase:"failed",error:`复色校验失败：${result.summary}`,errorMessage:`复色校验失败：${result.summary}`,qualityIssues:issues}:job.workflow==="recolor"&&result.status==="needs_review"?{status:"needs_review",requestStatus:"needs_review",qualityIssues:issues}:{})});
    return NextResponse.json({result});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"AI服装一致性检测失败"},{status:400});
  }
}
