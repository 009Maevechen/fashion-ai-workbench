import {NextResponse} from "next/server";
import {createProductSkill,listProductSkills} from "@/lib/product-skills";
import {productSkillSchema} from "@/lib/product-skill-schema";

export const dynamic="force-dynamic";
export async function GET(){return NextResponse.json(await listProductSkills())}
export async function POST(request:Request){
  try{return NextResponse.json(await createProductSkill(productSkillSchema.parse(await request.json())),{status:201})}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"保存产品 Skill 失败"},{status:400})}
}
