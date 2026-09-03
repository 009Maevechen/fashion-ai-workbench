import {NextResponse} from "next/server";
import {cancelGeneration} from "@/lib/job-runner";
import {z} from "zod";
import type {WorkflowType} from "@/lib/ai/types";

const schema=z.object({workflow:z.enum(["tryon","pose","recolor"])});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const {workflow}=schema.parse(await request.json());
    await cancelGeneration(id,workflow as WorkflowType);
    return NextResponse.json({ok:true});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"暂停生图失败"},{status:400});
  }
}
