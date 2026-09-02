import "server-only";
import { z } from "zod";
import type { GarmentConsistencyCheck, Job, Project } from "@/lib/db";
import { localImage, toDataUrl } from "./storage";
import { resolveQcModel } from "./provider-settings";
import { requestMultiVisionJson } from "./vision-chat";
import { garmentConsistencyPrompt } from "./prompts/consistency";
import { resizeToJpeg } from "../image-limits";

const checkSchema=z.object({
  consistent:z.boolean(),
  score:z.coerce.number().min(0).max(100),
  summary:z.string().min(1).max(2000).transform((value)=>value.trim().slice(0,500)),
  issues:z.array(z.string().min(1).max(1000).transform((value)=>value.trim().slice(0,200))).max(12).default([]),
  checks:z.object({silhouette:z.boolean(),material:z.boolean(),texture:z.boolean(),construction:z.boolean(),details:z.boolean(),color:z.boolean()}),
});

async function compactImage(url:string){
  const input=await localImage(url);
  return toDataUrl(await resizeToJpeg(input,1024,82),"image/jpeg");
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
  const variantReference=job.workflow==="recolor"?project.targetColors?.find(color=>color.id===job.targetColorId)?.cropImage:undefined;
  if(job.workflow==="recolor"&&!variantReference)throw new Error("找不到当前颜色款的整件服装设计参考，无法进行一对一复色质检");
  const runtime=await resolveQcModel();
  const inputs=job.workflow==="recolor"?[source,variantReference!,output]:[source,output];
  const parsed=checkSchema.parse(await requestMultiVisionJson(runtime,await Promise.all(inputs.map(compactImage)),"你是严格的电商服装质检员。必须基于可见证据判断，不得因人物姿势或背景不同而误判。",garmentConsistencyPrompt(job.workflow as "tryon"|"pose"|"recolor",project,job)));
  return {status:parsed.consistent&&parsed.score>=85?"passed":"needs_review",score:Math.round(parsed.score),summary:parsed.summary,issues:parsed.issues,checks:parsed.checks,checkedAt:new Date().toISOString(),model:runtime.model};
}
