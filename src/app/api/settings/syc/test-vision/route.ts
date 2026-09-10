import { NextResponse } from "next/server";
import { z } from "zod";
import { updateSycTestResult } from "@/lib/ai/provider-settings";
import { testSycVision } from "@/lib/ai/providers/syc/test-service";

const schema = z.object({
  baseUrl: z.string().max(500).optional(),
  apiKey: z.string().max(1000).optional(),
  visionModel: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const result = await testSycVision(schema.parse(await request.json()));
    await updateSycTestResult("vision", "success", undefined, result.latencyMs).catch(() => {});
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "视觉模型测试失败";
    await updateSycTestResult("vision", "failed", message, Date.now() - started).catch(() => {});
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
