import {NextResponse} from "next/server";
import {z} from "zod";
import {listPoseTemplateGroups} from "@/lib/db";
import {createPoseTemplateGroup} from "@/lib/pose-library";
import {movePoseLibraryFileToTrash} from "@/lib/ai/storage";

const productType=z.enum(["上衣","裤装","连衣裙","半身裙","套装"]);
const schema=z.object({
  name:z.string().min(1).max(100),description:z.string().max(500).optional(),productTypes:z.array(productType).min(1),
  shotType:z.enum(["full_body","half_body","upper_body","lower_body"]),faceMode:z.enum(["visible","hidden","either"]),
  styleTags:z.array(z.string().max(40)).max(20).optional(),platformTags:z.array(z.string().max(40)).max(20).optional(),displayFocus:z.array(z.string().max(80)).max(20).optional(),
  favorite:z.boolean().optional(),sourceProjectId:z.string().uuid().optional(),
  images:z.tuple([z.string().startsWith("/api/files/"),z.string().startsWith("/api/files/"),z.string().startsWith("/api/files/")]),
  poseNames:z.tuple([z.string().min(1).max(80),z.string().min(1).max(80),z.string().min(1).max(80)]),
  poseDescriptions:z.tuple([z.string().min(1).max(500),z.string().min(1).max(500),z.string().min(1).max(500)]),
});
export const dynamic="force-dynamic";
export async function GET(){return NextResponse.json(await listPoseTemplateGroups())}
export async function POST(request:Request){
  let images:string[]=[];
  try{const value=schema.parse(await request.json());images=value.images;const result=await createPoseTemplateGroup(value);return NextResponse.json(result,{status:result.created?201:200})}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"保存姿势模板失败"},{status:400})}
  finally{for(const url of images)if(url.startsWith("/api/files/pose-library/source/"))await movePoseLibraryFileToTrash(url).catch(()=>{})}
}
