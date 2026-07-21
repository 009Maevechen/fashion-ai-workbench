import {NextResponse} from "next/server";
import {z} from "zod";
import {getWorkflowModelBindings,getWorkflowRuntimeSummary,saveWorkflowModelBindings} from "@/lib/ai/provider-settings";

const selection=z.object({providerId:z.string().min(1),model:z.string().min(1).max(200)});const binding=z.object({primary:selection.optional(),fallback:selection.optional()});const schema=z.object({tryon:binding,pose:binding,recolor:binding});
export const dynamic="force-dynamic";
export async function GET(){return NextResponse.json({bindings:await getWorkflowModelBindings(),runtime:await getWorkflowRuntimeSummary()})}
export async function PUT(request:Request){try{const bindings=await saveWorkflowModelBindings(schema.parse(await request.json()));return NextResponse.json({bindings,runtime:await getWorkflowRuntimeSummary()})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"工作流模型绑定保存失败"},{status:400})}}
