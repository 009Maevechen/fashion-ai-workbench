import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { resolvePromptOptimizeModel } from "./provider-settings";
import { requestTextJson } from "./vision-chat";

const schema = z.object({
  description: z.string().min(1).max(2000).optional(),
  details: z.string().min(1).max(4000).optional(),
});

// 同一份输入内容的结果缓存，避免重复生成/重试时反复调用 Prompt 优化模型。
const cache = new Map<string, { description?: string; details?: string }>();
const CACHE_MAX = 200;

/**
 * 用 Prompt 优化模型（如 DeepSeek）把用户输入的简单中文咒语，
 * 整理成结构化、高质量、图片模型更易理解的中文描述。
 * 配置了 Prompt 优化模型时使用模型整理；未配置或调用失败时回退为原文，保证流程可用。
 * 同一输入内容命中内存缓存直接复用，不重复调用模型。
 */
export async function optimizePrompt(input: {
  description?: string;
  details?: string;
}): Promise<{ description?: string; details?: string }> {
  const description = input.description?.trim();
  const details = input.details?.trim();
  if (!description && !details) return input;
  const cacheKey = crypto.createHash("sha256").update(`${description || ""}\u0000${details || ""}`).digest("hex");
  const cached = cache.get(cacheKey);
  if (cached) return { description: cached.description || description, details: cached.details || details };
  try {
    const runtime = await resolvePromptOptimizeModel();
    const result = await requestTextJson(
      runtime,
      "你是电商服装图片生成咒语整理助手。把用户输入的简短中文咒语，整理成结构化、高质量、图片模型更易理解的中文描述。忠实保留用户提到的所有元素，不得擅自添加或删除款式、颜色、材质、版型、细节；用词更具体、更规范，补充合理的服装术语描述（如领型、袖型、版型、面料质感、结构细节），但绝不能臆造用户没提到的内容。只返回合法 JSON，字段为 description 和 details（可选）。",
      `用户输入描述：${description || "（无）"}\n用户输入细节：${details || "（无）"}\n\n返回 {"description":"整理后的服装描述","details":"整理后的重点细节"}。若某项没有用户输入，对应字段返回空字符串。`,
    );
    const parsed = schema.safeParse(result);
    if (!parsed.success) return input;
    const optimized = {
      description: parsed.data.description?.trim() || description,
      details: parsed.data.details?.trim() || details,
    };
    if (cache.size >= CACHE_MAX) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(cacheKey, optimized);
    return optimized;
  } catch {
    return input;
  }
}
