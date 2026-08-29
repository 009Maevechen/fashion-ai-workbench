import {NextResponse} from "next/server";
import {z} from "zod";
import {createApiProvider,listApiProviders} from "@/lib/ai/provider-settings";

const schema=z.object({name:z.string().min(1).max(80),type:z.enum(["openai-compatible","fashn","bfl","volcengine","flux","custom","deepseek"]),baseUrl:z.string().min(1).max(500),apiKey:z.string().min(1).max(1000),defaultModel:z.string().min(1).max(200),enabled:z.boolean().optional(),notes:z.string().max(500).optional()});
export const dynamic="force-dynamic";
export async function GET(){return NextResponse.json(await listApiProviders())}
export async function POST(request:Request){try{return NextResponse.json(await createApiProvider(schema.parse(await request.json())),{status:201})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"新增API配置失败"},{status:400})}}
