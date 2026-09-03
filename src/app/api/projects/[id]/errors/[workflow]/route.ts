import {NextResponse} from "next/server";
import {clearWorkflowErrors,getProject,listJobs} from "@/lib/db";
import {moveFilesToTrashStrict} from "@/lib/ai/storage";
import type {WorkflowType} from "@/lib/ai/types";

const WORKFLOWS=new Set<WorkflowType>(["tryon","pose","recolor"]);

// 清空某个工作流的错误生图内容：只删除失败/中断的任务及其输出，保留成功结果与上传素材。
export async function DELETE(_:Request,{params}:{params:Promise<{id:string;workflow:string}>}){
  try{
    const {id,workflow:raw}=await params;
    if(!WORKFLOWS.has(raw as WorkflowType))throw new Error("不支持的结果类型");
    const workflow=raw as WorkflowType,project=await getProject(id);
    if(!project)throw new Error("项目不存在");
    const jobs=await listJobs({projectId:id});
    const errorJobs=jobs.filter(job=>job.workflow===workflow&&(job.status==="failed"||job.status==="interrupted"));
    if(!errorJobs.length)return NextResponse.json({project,message:"当前模块没有错误生图内容",clearedCount:0});
    const urls=[...new Set(errorJobs.flatMap(job=>job.outputImages))];
    await moveFilesToTrashStrict(urls,id);
    const cleared=await clearWorkflowErrors(id,workflow);
    return NextResponse.json({message:`已清除 ${cleared} 条错误生图记录`,clearedCount:cleared});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"清空错误内容失败"},{status:400});
  }
}
