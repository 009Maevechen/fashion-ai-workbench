import {NextResponse} from "next/server";
import {z} from "zod";
import {deleteApiProvider,updateApiProvider} from "@/lib/ai/provider-settings";

const schema=z.object({name:z.string().min(1).max(80).optional(),type:z.enum(["openai-compatible","fashn","bfl","volcengine","flux","custom"]).optional(),baseUrl:z.string().min(1).max(500).optional(),apiKey:z.string().max(1000).optional(),defaultModel:z.string().min(1).max(200).optional(),enabled:z.boolean().optional(),notes:z.string().max(500).optional()});
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await updateApiProvider((await params).id,schema.parse(await request.json())))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"编辑API配置失败"},{status:400})}}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){try{await deleteApiProvider((await params).id);return new NextResponse(null,{status:204})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"删除API配置失败"},{status:400})}}
