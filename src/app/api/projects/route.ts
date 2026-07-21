import {NextResponse} from "next/server";import {createProject,listProjects} from "@/lib/db";import {z} from "zod";
const schema=z.object({sku:z.string().min(1).max(80),productName:z.string().min(1).max(120),productType:z.enum(["上衣","裤装","连衣裙","半身裙","套装"])});
export async function GET(){return NextResponse.json(await listProjects())}export async function POST(r:Request){try{return NextResponse.json(await createProject(schema.parse(await r.json())),{status:201})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"创建失败"},{status:400})}}
