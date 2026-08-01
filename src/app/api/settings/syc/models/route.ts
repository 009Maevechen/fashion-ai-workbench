import {NextResponse} from "next/server";
import {z} from "zod";
import {listSycModels} from "@/lib/ai/providers/syc/test-service";

const schema=z.object({baseUrl:z.string().max(500).optional(),apiKey:z.string().max(1000).optional(),imageModel:z.string().max(200).optional()});
export async function POST(request:Request){try{return NextResponse.json(await listSycModels(schema.parse(await request.json().catch(()=>({})))))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"获取 SYC 模型失败"},{status:400})}}
