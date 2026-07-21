import {NextResponse} from "next/server";
import {deleteWorkflowRecords,getProject,listJobs,listOperations,updateProject} from "@/lib/db";
import {moveFilesToTrashStrict} from "@/lib/ai/storage";
import {hasWorkflowResults,prepareResultCleanup} from "@/lib/result-cleanup";
import type {WorkflowType} from "@/lib/ai/types";

const WORKFLOWS=new Set<WorkflowType>(["tryon","pose","recolor"]);

export async function DELETE(_:Request,{params}:{params:Promise<{id:string;workflow:string}>}){
  try{
    const {id,workflow:raw}=await params;
    if(!WORKFLOWS.has(raw as WorkflowType))throw new Error("不支持的结果类型");
    const workflow=raw as WorkflowType,project=await getProject(id);
    if(!project)throw new Error("项目不存在");
    const operations=await listOperations(id);
    if(operations.some(operation=>operation.workflow===workflow&&(operation.status==="queued"||operation.status==="running")))throw new Error("当前模块仍在生成中，请等待任务结束后再清空结果");
    const jobs=await listJobs({projectId:id});
    if(!hasWorkflowResults(project,jobs,workflow))return NextResponse.json({project,message:"当前模块没有可清空的结果",clearedCount:0});
    const cleanup=prepareResultCleanup(project,jobs,workflow);
    await moveFilesToTrashStrict(cleanup.urls,id);
    await deleteWorkflowRecords(id,workflow);
    const updated=await updateProject(id,cleanup.patch);
    return NextResponse.json({project:updated,message:"当前模块结果已清空，上传素材已保留",clearedCount:cleanup.urls.length});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"清空结果失败"},{status:400})}
}
