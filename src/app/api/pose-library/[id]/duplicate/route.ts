import {NextResponse} from "next/server";
import {duplicatePoseTemplateGroup} from "@/lib/pose-library";
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await duplicatePoseTemplateGroup((await params).id),{status:201})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"复制姿势模板失败"},{status:400})}}
