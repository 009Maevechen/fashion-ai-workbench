import "server-only";
import sharp from "sharp";
import { z } from "zod";
import type { GarmentConsistencyCheck, Job, Project } from "@/lib/db";
import { localImage, toDataUrl } from "./storage";
import { resolveQcModel } from "./provider-settings";
import { requestMultiVisionJson } from "./vision-chat";
import { garmentConsistencyPrompt } from "./prompts/consistency";

const checkSchema=z.object({
  consistent:z.boolean(),
  score:z.coerce.number().min(0).max(100),
  summary:z.string().min(1).max(500),
  issues:z.array(z.string().min(1).max(200)).max(12).default([]),
  checks:z.object({silhouette:z.boolean(),material:z.boolean(),texture:z.boolean(),construction:z.boolean(),details:z.boolean(),color:z.boolean()}),
});

async function compactImage(url:string){
  const input=await localImage(url);
  return toDataUrl(await sharp(input).rotate().resize({width:1024,height:1024,fit:"inside",withoutEnlargement:true}).jpeg({quality:82,mozjpeg:true}).toBuffer(),"image/jpeg");
}

export async function checkGarmentConsistency(project:Project,job:Job):Promise<GarmentConsistencyCheck>{
  if(!["tryon","pose","recolor"].includes(job.workflow))throw new Error("当前生成结果不支持服装一致性检测");
  const output=job.outputImages[0];
  if(!output)throw new Error("该任务还没有可检测的生成结果");
  const source=job.workflow==="recolor"
    ?(job.sourceModelImage||job.inputImages[0]||project.confirmedPoseImages?.[(job.slot||1)-1])
    :job.workflow==="tryon"
      ?(project.assets.garmentImage||job.inputImages[1])
      :(project.assets.garmentImage||job.sourceModelImage||job.inputImages[0]||project.confirmedTryonImage);
  if(!source)throw new Error("找不到原产品服装基准图，请先保留产品图或输入图");
  const runtime=await resolveQcModel();
  const parsed=checkSchema.parse(await requestMultiVisionJson(runtime,await Promise.all([compactImage(source),compactImage(output)]),"你是严格的电商服装质检员。必须基于可见证据判断，不得因人物姿势或背景不同而误判。",garmentConsistencyPrompt(job.workflow,project,job)));
  return {status:parsed.consistent&&parsed.score>=85?"passed":"needs_review",score:Math.round(parsed.score),summary:parsed.summary,issues:parsed.issues,checks:parsed.checks,checkedAt:new Date().toISOString(),model:runtime.model};
}
