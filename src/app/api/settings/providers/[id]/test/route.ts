import {NextResponse} from "next/server";
import {z} from "zod";
import {testProviderConnection,testProviderImage} from "@/lib/ai/provider-test";
import {updateProviderTestResult} from "@/lib/ai/provider-settings";

const schema=z.object({mode:z.enum(["connection","image"]).default("connection")});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const id=(await params).id;try{const {mode}=schema.parse(await request.json().catch(()=>({}))),result=mode==="image"?await testProviderImage(id):await testProviderConnection(id);await updateProviderTestResult(id,"success");return NextResponse.json(result)}catch(error){const message=error instanceof Error?error.message:"测试失败";await updateProviderTestResult(id,"failed",message).catch(()=>{});return NextResponse.json({error:message},{status:400})}}
