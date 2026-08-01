import {NextResponse} from "next/server";
import {z} from "zod";
import {updateSycTestResult} from "@/lib/ai/provider-settings";
import {testSycImage} from "@/lib/ai/providers/syc/test-service";

const schema=z.object({baseUrl:z.string().max(500).optional(),apiKey:z.string().max(1000).optional(),imageModel:z.string().max(200).optional()});
export async function POST(request:Request){
  try{const result=await testSycImage(schema.parse(await request.json().catch(()=>({}))));await updateSycTestResult("image","success").catch(()=>{});return NextResponse.json(result)}
  catch(error){const message=error instanceof Error?error.message:"真实图片测试失败";await updateSycTestResult("image","failed",message).catch(()=>{});return NextResponse.json({error:message},{status:400})}
}
