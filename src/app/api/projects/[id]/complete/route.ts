import {NextResponse} from "next/server";
import {getProject,updateProject} from "@/lib/db";
import {finalPackagePhotoCount} from "@/lib/final-package";
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id,project=await getProject(id);if(!project)throw new Error("项目不存在");
    if(finalPackagePhotoCount(project)===0)throw new Error("当前货号还没有可导出的结果照片");
    return NextResponse.json(await updateProject(id,{status:"已完成",dependencyStatus:"current",stepStatuses:{...project.stepStatuses,"5":"completed"}}));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"无法完成项目"},{status:400})}
}
