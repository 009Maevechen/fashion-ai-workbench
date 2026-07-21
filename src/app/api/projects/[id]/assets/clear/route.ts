import {NextResponse} from "next/server";
import {getProject,updateProject} from "@/lib/db";
import {prepareSourceAssetCleanup} from "@/lib/asset-cleanup";
import {moveFilesToTrashStrict} from "@/lib/ai/storage";
import {invalidateForAssetChange} from "@/lib/workflow";

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id,project=await getProject(id);if(!project)throw new Error("项目不存在");
    const cleanup=prepareSourceAssetCleanup(project);if(!cleanup.urls.length)return NextResponse.json({project,message:"当前任务没有可清空的素材",clearedCount:0});
    const clearedCount=await moveFilesToTrashStrict(cleanup.urls,id);
    await updateProject(id,{assets:cleanup.assets,targetColors:cleanup.targetColors});
    await invalidateForAssetChange(id,"garmentImage");await invalidateForAssetChange(id,"modelReferenceImage");await invalidateForAssetChange(id,"standalonePoseInputImage");await invalidateForAssetChange(id,"colorReferenceImage");await invalidateForAssetChange(id,"standaloneRecolorPoseImages");
    return NextResponse.json({project:await getProject(id),message:"当前任务素材已清空，生成结果已保留",clearedCount});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"清空素材失败"},{status:400})}
}
