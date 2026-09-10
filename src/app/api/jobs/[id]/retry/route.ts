import { NextResponse } from "next/server";
import { z } from "zod";
import { retryJob } from "@/lib/job-runner";

const commandPlanSchema = z.object({
  original: z.string().trim().min(1).max(800),
  mustChange: z.array(z.string().trim().min(1).max(300)).max(12),
  mustKeep: z.array(z.string().trim().min(1).max(300)).max(12),
  forbiddenChanges: z.array(z.string().trim().min(1).max(300)).max(12),
  referenceSources: z.array(z.string().trim().min(1).max(300)).max(8),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).max(12),
});
const schema = z
  .object({
    modelPreference: z.enum(["primary", "fallback"]).default("primary"),
    correctionRequest: z.string().trim().min(1).max(800).optional(),
    correctionPlan: commandPlanSchema.optional(),
  })
  .refine(
    (value) =>
      !value.correctionPlan ||
      value.correctionPlan.original === value.correctionRequest,
    { message: "确认的咒语规则与原始命令不一致，请重新解析确认" },
  );
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { modelPreference, correctionRequest, correctionPlan } = schema.parse(
        await request.json().catch(() => ({})),
      ),
      operation = await retryJob(
        (await params).id,
        modelPreference,
        correctionRequest,
        correctionPlan,
      );
    return NextResponse.json(
      { jobId: operation.id, status: operation.status },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "任务重试失败" },
      { status: 400 },
    );
  }
}
