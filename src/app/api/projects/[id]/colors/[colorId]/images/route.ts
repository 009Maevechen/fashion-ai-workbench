import {NextResponse} from "next/server";
import {getProject,listJobs,patchJob,updateProject} from "@/lib/db";
import {moveFileToTrash} from "@/lib/ai/storage";
import {removeRecolorCollectionImage} from "@/lib/recolor-collection";

export async function DELETE(request:Request,{params}:{params:Promise<{id:string;colorId:string}>}){
  try{
    const {id,colorId}=await params,{url}=await request.json() as {url?:string};
    if(!url?.startsWith("/api/files/"))throw new Error("图片地址无效");
    const project=await getProject(id);if(!project)throw new Error("项目不存在");
    const patch=removeRecolorCollectionImage(project,colorId,url);
    await moveFileToTrash(url,id);
    for(const job of (await listJobs({projectId:id})).filter(item=>item.workflow==="recolor"&&item.targetColorId===colorId&&item.outputImages.includes(url))){
      await patchJob(job.id,{outputImages:job.outputImages.filter(item=>item!==url),status:"needs_review",error:"该结果已由用户从复色集合中删除"});
    }
    return NextResponse.json(await updateProject(id,patch));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"删除复色结果失败"},{status:400})}
}
