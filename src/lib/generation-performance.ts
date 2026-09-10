import type { ApiProviderType } from "./ai/provider-settings-types";
import type { GenerationMode } from "./ai/types";

/**
 * 生图服务并发策略。
 * SYC 中转站历史上在并发请求时会返回 499，因此继续严格串行；直连且支持
 * 稳定并发的服务按模式放宽到 2~3 张，让三姿势和复色真正并行完成。
 */
export function generationProviderConcurrency(
  provider: ApiProviderType,
  mode: GenerationMode,
) {
  if (provider === "syc-openai-compatible") return 1;
  if (provider === "fashn" || provider === "bfl") return 2;
  return mode === "fast" ? 3 : 2;
}
