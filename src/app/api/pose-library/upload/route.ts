import {NextResponse} from "next/server";
import {persistUpload} from "@/lib/workflow";

export async function POST(request:Request){
  try{const form=await request.formData(),file=form.get("file"),index=Number(form.get("poseIndex"));if(!(file instanceof File)||![1,2,3].includes(index))throw new Error("缺少有效姿势图片或序号");const url=await persistUpload(file,"pose-library",`pose-upload-${index}`);return NextResponse.json({url,status:"saved"})}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"上传姿势图片失败"},{status:400})}
}
