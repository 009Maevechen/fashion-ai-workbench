import {NextResponse} from "next/server";
import {z} from "zod";
import {retryJob} from "@/lib/job-runner";

const schema=z.object({modelPreference:z.enum(["primary","fallback"]).default("primary")});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{const {modelPreference}=schema.parse(await request.json().catch(()=>({}))),operation=await retryJob((await params).id,modelPreference);return NextResponse.json({jobId:operation.id,status:operation.status},{status:202})}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"任务重试失败"},{status:400})}
}
