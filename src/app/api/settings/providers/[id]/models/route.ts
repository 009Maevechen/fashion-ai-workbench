import { NextResponse } from "next/server";
import { listProviderModels } from "@/lib/ai/provider-test";

/** 获取 OpenAI 兼容 Provider 的真实模型列表。 */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = (await params).id;
    return NextResponse.json(await listProviderModels(id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取模型列表失败" },
      { status: 400 },
    );
  }
}
