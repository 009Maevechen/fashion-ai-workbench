import "server-only";
import type { ApiProviderPublic, ModelInventoryEntry } from "./provider-settings-types";
import { inferCapabilities } from "./model-capabilities";

/**
 * 模型库存：从已配置 Provider 的各个模型字段（图片/视觉/对话/默认）推导出
 * 可调度模型清单。每个模型带能力标签，供模型中心与工作流分配使用。
 */
export function buildModelInventory(
  providers: ApiProviderPublic[],
): ModelInventoryEntry[] {
  const entries: ModelInventoryEntry[] = [];
  for (const provider of providers) {
    const modelIds = new Set<string>();
    if (provider.defaultModel) modelIds.add(provider.defaultModel);
    if (provider.imageModel) modelIds.add(provider.imageModel);
    if (provider.visionModel) modelIds.add(provider.visionModel);
    if (provider.chatModel) modelIds.add(provider.chatModel);
    for (const modelId of modelIds) {
      entries.push({
        providerId: provider.id,
        providerName: provider.name,
        modelId,
        displayName: `${provider.name} · ${modelId}`,
        enabled: provider.enabled,
        configured: Boolean(provider.hasApiKey && provider.baseUrl),
        lastTestStatus: provider.lastTestStatus,
        lastTestAt: provider.lastTestAt,
        averageLatencyMs: provider.lastTestLatencyMs,
        notes: provider.notes,
        capabilities: inferCapabilities(provider.type, modelId),
      });
    }
  }
  return entries;
}
