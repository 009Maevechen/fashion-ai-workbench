import {NextResponse} from "next/server";
import {z} from "zod";
import {applyPoseTemplateGroup} from "@/lib/pose-library";
const schema=z.object({projectId:z.string().uuid()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await applyPoseTemplateGroup((await params).id,schema.parse(await request.json()).projectId))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"应用姿势模板失败"},{status:400})}}
