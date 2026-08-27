import { NextResponse } from "next/server";
import { listApiProviders } from "@/lib/ai/provider-settings";
import { buildModelInventory } from "@/lib/ai/model-inventory";
import {
  CAPABILITY_LABELS,
  WORKFLOW_LABELS,
  WORKFLOW_DESCRIPTIONS,
  WORKFLOW_REQUIRED_CAPABILITIES,
  inferCapabilities,
} from "@/lib/ai/model-capabilities";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = await listApiProviders();
  const inventory = buildModelInventory(providers);
  return NextResponse.json({
    inventory,
    capabilities: Object.entries(CAPABILITY_LABELS).map(([id, label]) => ({ id, label })),
    workflows: (Object.keys(WORKFLOW_LABELS) as (keyof typeof WORKFLOW_LABELS)[]).map(
      (key) => ({
        key,
        label: WORKFLOW_LABELS[key],
        description: WORKFLOW_DESCRIPTIONS[key],
        requiredCapabilities: WORKFLOW_REQUIRED_CAPABILITIES[key].map(
          (capability) => CAPABILITY_LABELS[capability],
        ),
      }),
    ),
  });
}

/** 按能力推断接口：前端给模型 ID + 提供商类型即可得到能力标签。 */
export async function POST(request: Request) {
  try {
    const { providerType, modelId } = (await request.json()) as {
      providerType?: string;
      modelId?: string;
    };
    if (!providerType || !modelId) throw new Error("缺少提供商类型或模型 ID");
    const capabilities = inferCapabilities(providerType as never, modelId);
    return NextResponse.json({
      capabilities: capabilities.map((capability) => ({
        id: capability,
        label: CAPABILITY_LABELS[capability],
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "能力推断失败" },
      { status: 400 },
    );
  }
}
