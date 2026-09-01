import {NextResponse} from "next/server";
import {z} from "zod";
import {enqueueWorkflow} from "@/lib/job-runner";

const maskSchema = z.string().refine(
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
    const operation = await enqueueWorkflow("inpaint", input, input.idempotencyKey);
    return NextResponse.json({ jobId: operation.id, status: operation.status }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "局部重绘任务提交失败" },
      { status: 400 },
    );
  }
}
