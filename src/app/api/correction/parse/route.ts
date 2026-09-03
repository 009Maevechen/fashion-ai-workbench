import {NextResponse} from "next/server";
import {z} from "zod";
import {refineCorrectionRequest} from "@/lib/ai/correction-refine";

const schema=z.object({command:z.string().trim().min(1).max(800)});
export async function POST(request:Request){
  try{return NextResponse.json({plan:await refineCorrectionRequest(schema.parse(await request.json()).command)});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"咒语解析失败"},{status:400});}
}
