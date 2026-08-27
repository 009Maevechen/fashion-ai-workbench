import {NextResponse} from "next/server";
import {z} from "zod";
import {testProviderConnection,testProviderImage} from "@/lib/ai/provider-test";
import {updateProviderTestResult} from "@/lib/ai/provider-settings";
import type {ProviderTestStatus} from "@/lib/ai/provider-settings-types";

const schema=z.object({mode:z.enum(["connection","image"]).default("connection")});
function classify(error:Error):ProviderTestStatus{
  const message=error.message;
  if(/401|无效|无权限|认证失败/i.test(message))return "auth_failed";
  if(/429|限流|额度|过于频繁/i.test(message))return "rate_limited";
  if(/404|不存在|无效.*模型|model.*not/i.test(message))return "model_not_found";
  return "failed";
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const id=(await params).id;
  let mode:"connection"|"image"="connection";
  try{
    mode=schema.parse(await request.json().catch(()=>({}))).mode;
    const result=mode==="image"?await testProviderImage(id):await testProviderConnection(id);
    await updateProviderTestResult(id,mode,"success");
    return NextResponse.json(result);
  }catch(error){
    const cause=error instanceof Error?error:new Error("测试失败");
    const status=classify(cause);
    await updateProviderTestResult(id,mode,status,cause.message).catch(()=>{});
    return NextResponse.json({error:cause.message,status},{status:400});
  }
}
