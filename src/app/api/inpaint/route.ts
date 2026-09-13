import {NextResponse} from "next/server";
import {z} from "zod";
import {enqueueWorkflow} from "@/lib/job-runner";
import {getJob,getProject} from "@/lib/db";
import {localImage,saveOutput} from "@/lib/ai/storage";
import {prepareProviderInput,safeSegment} from "@/lib/ai/validators";
import {serializeImageWork} from "@/lib/image-limits";
import sharp from "sharp";
import {assertFormalImageSource} from "@/lib/image-sources";

const maskSchema = z.string().max(16*1024*1024).refine(
  (value) => /^data:image\/png;base64,/.test(value),
  "蒙版必须是 PNG Data URL",
);

const schema = z.object({
  projectId: z.string().uuid(),
  sourceImageId: z.string().min(1),
  sourceStep: z.enum(["tryon", "pose", "recolor", "inpaint"]),
  sourceUrl: z.string().startsWith("/api/files/"),
  maskDataUrl: maskSchema,
  editPrompt: z.string().trim().min(1).max(800),
  contextHint: z.string().max(800).optional(),
  mode: z.enum(["fast", "standard", "quality"]).default("standard"),
  slot: z.number().int().min(1).max(4).optional(),
  modelPreference: z.enum(["primary", "fallback"]).optional(),
  idempotencyKey: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const project=await getProject(input.projectId);
    if(!project)throw new Error("商品项目不存在");
    assertFormalImageSource(input.sourceUrl,"局部重绘正式源图");
    const sourceJob=await getJob(input.sourceImageId);
    if(!sourceJob||sourceJob.projectId!==project.id||!sourceJob.outputImages.includes(input.sourceUrl))throw new Error("局部重绘必须通过 imageId 读取当前项目已持久化的 masterSource / approvedSource");
    const encoded=input.maskDataUrl.slice(input.maskDataUrl.indexOf(",")+1);
    if(encoded.length>16*1024*1024)throw new Error("局部重绘选区过大，请缩小选区后重试");
    const mask=Buffer.from(encoded,"base64");
    if(mask.length<100||mask.length>12*1024*1024)throw new Error("局部重绘选区文件大小异常");
    const metadata=await sharp(mask,{failOn:"error",limitInputPixels:24_000_000}).metadata().catch(()=>{throw new Error("局部重绘选区无法读取")});
    if(metadata.format!=="png"||!metadata.width||!metadata.height)throw new Error("局部重绘选区必须是有效 PNG 图片");
    const normalizedMask=await serializeImageWork(async()=>{
      const source=await prepareProviderInput(await localImage(input.sourceUrl));
      const sourceMeta=await sharp(source.buffer,{failOn:"error",limitInputPixels:24_000_000}).metadata();
      if(!sourceMeta.width||!sourceMeta.height)throw new Error("局部重绘原图尺寸无效");
      return sharp(mask,{failOn:"error",limitInputPixels:24_000_000})
        .resize({width:sourceMeta.width,height:sourceMeta.height,fit:"fill",kernel:"nearest"})
        .tint({r:255,g:255,b:255})
        .png({compressionLevel:9})
        .toBuffer();
    });
    const maskUrl=await saveOutput(project.sku,"inpaint/masks",`${safeSegment(input.sourceImageId)}-${crypto.randomUUID()}.png`,normalizedMask);
    const {maskDataUrl:_,...payload}=input;
    void _;
    const workflowPayload={...payload,maskUrl};
    const operation = await enqueueWorkflow("inpaint", workflowPayload, input.idempotencyKey);
    return NextResponse.json({ jobId: operation.id, status: operation.status }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "局部重绘任务提交失败" },
      { status: 400 },
    );
  }
}
