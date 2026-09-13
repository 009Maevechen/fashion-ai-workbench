import {NextResponse} from "next/server";
import {enqueueWorkflow} from "@/lib/job-runner";
import {getProject} from "@/lib/db";
import {assertFormalImageSource} from "@/lib/image-sources";
import {z} from "zod";

const image=z.string().startsWith("/api/files/");
const schema=z.object({projectId:z.string().uuid(),sourceImage:image,poseReferenceImages:z.array(image).length(3),referenceMode:z.enum(["library","upload"]),mode:z.enum(["fast","standard","quality"]),shotType:z.enum(["上半身","下半身","全身"]),face:z.boolean(),background:z.boolean(),detailRequirements:z.string().min(1).max(2000),poseInstructions:z.array(z.string().min(1).max(500)).length(3).optional(),focus:z.enum(["upper","lower"]).optional(),slot:z.number().int().min(1).max(3).optional(),modelPreference:z.enum(["primary","fallback"]).optional(),idempotencyKey:z.string().max(200).optional()});

export async function POST(request:Request){try{
  const input=schema.parse(await request.json()),project=await getProject(input.projectId);if(!project)throw new Error("项目不存在");
  const standalone=input.sourceImage===project.assets.standalonePoseInputImage,sourceImage=standalone?project.assets.standalonePoseInputImage:project.confirmedTryonImage;
  if(!sourceImage)throw new Error(standalone?"独立姿势正式源图不存在":"请先人工确认换装高清图");
  const poseReferenceImages=input.referenceMode==="library"?(project.poseTemplateSnapshot?.poses.map(pose=>pose.referenceImagePath)||input.poseReferenceImages):project.assets.poseReferenceImages;
  if(!poseReferenceImages||poseReferenceImages.length!==3)throw new Error("请先准备三张已持久化姿势参考图");
  assertFormalImageSource(sourceImage,"三姿势人物源图");poseReferenceImages.forEach((url,index)=>assertFormalImageSource(url,`姿势${index+1}参考图`));
  const payload={...input,sourceImage,poseReferenceImages},operation=await enqueueWorkflow("pose",payload,input.idempotencyKey);return NextResponse.json({jobId:operation.id,status:operation.status},{status:202});
}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"姿势生成失败"},{status:400})}}
