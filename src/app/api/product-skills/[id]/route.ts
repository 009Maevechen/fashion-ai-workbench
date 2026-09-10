import {NextResponse} from "next/server";
import {getProductSkill,updateProductSkill} from "@/lib/product-skills";
import {productSkillUpdateSchema} from "@/lib/product-skill-schema";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const skill=await getProductSkill((await params).id);return skill?NextResponse.json(skill):NextResponse.json({error:"产品 Skill 不存在"},{status:404})}
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  try{return NextResponse.json(await updateProductSkill((await params).id,productSkillUpdateSchema.parse(await request.json())))}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"更新产品 Skill 失败"},{status:400})}
}
