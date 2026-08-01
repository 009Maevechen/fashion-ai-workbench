import {NextResponse} from "next/server";
import {z} from "zod";
import {deleteSycConfig,getSycConfig,saveSycConfig} from "@/lib/ai/provider-settings";

const schema=z.object({
  name:z.string().min(1).max(80),baseUrl:z.string().min(1).max(500),apiKey:z.string().max(1000).optional(),
  imageModel:z.string().min(1).max(200),chatModel:z.string().max(200).optional(),stream:z.boolean(),
  partialImages:z.number().int().min(0).max(3),returnBase64:z.boolean(),codexCliCompatible:z.boolean(),
  timeoutSeconds:z.number().int().min(10).max(900),enabled:z.boolean(),
});
export const dynamic="force-dynamic";
export async function GET(){return NextResponse.json(await getSycConfig())}
export async function PUT(request:Request){try{return NextResponse.json(await saveSycConfig(schema.parse(await request.json())))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"保存 SYC 配置失败"},{status:400})}}
export async function DELETE(){try{await deleteSycConfig();return new NextResponse(null,{status:204})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"删除 SYC 配置失败"},{status:400})}}
