import { NextResponse } from "next/server";
import { getWorkflowRuntimeSummary, listApiProviders } from "@/lib/ai/provider-settings";

export const dynamic = "force-dynamic";

const WORKFLOW_LABEL: Record<string, string> = {
  product: "商品视觉识别",
  tryon: "服装换装",
  pose: "三种姿势",
  recolor: "服装复色",
  qc: "QC质量检查",
  research: "爆款研究",
  assistant: "AI助手",
};

export async function GET() {
  const [providers, runtime] = await Promise.all([listApiProviders(), getWorkflowRuntimeSummary()]);
  return NextResponse.json({
    providers: providers.map((provider) => ({
      name: provider.name,
      type: provider.type,
      enabled: provider.enabled,
      configured: Boolean(provider.enabled && provider.hasApiKey),
      lastTestStatus: provider.lastTestStatus,
      lastError: provider.lastError,
    })),
    workflows: Object.entries(runtime).map(([key, value]) => ({
      key,
      label: WORKFLOW_LABEL[key] || key,
      primary: { ...value.primary },
      fallback: { ...value.fallback },
    })),
  });
}
