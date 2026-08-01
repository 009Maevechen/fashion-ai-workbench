import {NextResponse} from "next/server";
import {getPoseTemplateGroup,patchPoseTemplateGroup} from "@/lib/db";
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){try{const id=(await params).id,group=await getPoseTemplateGroup(id);if(!group)throw new Error("姿势模板组不存在");return NextResponse.json(await patchPoseTemplateGroup(id,{favorite:!group.favorite}))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"收藏操作失败"},{status:400})}}
