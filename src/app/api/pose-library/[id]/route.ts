import {NextResponse} from "next/server";
import {z} from "zod";
import {getPoseTemplateGroup} from "@/lib/db";
import {deletePoseTemplateGroup,updatePoseTemplateMetadata} from "@/lib/pose-library";

const schema=z.object({name:z.string().min(1).max(100).optional(),description:z.string().max(500).optional(),productTypes:z.array(z.enum(["上衣","裤装","连衣裙","半身裙","套装"])).min(1).optional(),shotType:z.enum(["full_body","half_body","upper_body","lower_body"]).optional(),faceMode:z.enum(["visible","hidden","either"]).optional(),styleTags:z.array(z.string().max(40)).max(20).optional(),platformTags:z.array(z.string().max(40)).max(20).optional(),displayFocus:z.array(z.string().max(80)).max(20).optional(),favorite:z.boolean().optional(),archived:z.boolean().optional()});
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const group=await getPoseTemplateGroup((await params).id);return group?NextResponse.json(group):NextResponse.json({error:"姿势模板组不存在"},{status:404})}
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await updatePoseTemplateMetadata((await params).id,schema.parse(await request.json())))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"更新姿势模板失败"},{status:400})}}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){try{await deletePoseTemplateGroup((await params).id);return new NextResponse(null,{status:204})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"删除姿势模板失败"},{status:400})}}
