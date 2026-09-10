import {NextResponse} from "next/server";
import {duplicateProductSkill} from "@/lib/product-skills";

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{return NextResponse.json(await duplicateProductSkill((await params).id),{status:201})}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"复制产品 Skill 失败"},{status:400})}
}
