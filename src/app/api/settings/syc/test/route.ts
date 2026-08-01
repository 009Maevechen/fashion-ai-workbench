import {NextResponse} from "next/server";
import {z} from "zod";
import {updateSycTestResult} from "@/lib/ai/provider-settings";
import {testSycConnection} from "@/lib/ai/providers/syc/test-service";

const schema=z.object({baseUrl:z.string().max(500).optional(),apiKey:z.string().max(1000).optional(),imageModel:z.string().max(200).optional()});
export async function POST(request:Request){
  const started=Date.now();
  try{const result=await testSycConnection(schema.parse(await request.json().catch(()=>({}))));await updateSycTestResult("connection","success",undefined,result.latencyMs).catch(()=>{});return NextResponse.json(result)}
  catch(error){const message=error instanceof Error?error.message:"测试连接失败";await updateSycTestResult("connection","failed",message,Date.now()-started).catch(()=>{});return NextResponse.json({error:message},{status:400})}
}
