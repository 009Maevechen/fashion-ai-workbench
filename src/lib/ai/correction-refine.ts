import "server-only";
import { z } from "zod";
import { resolveCorrectionModel } from "./provider-settings";
import { requestTextJson } from "./vision-chat";
import type { CorrectionCommandPlan } from "../correction-command";
import {
  deterministicCorrectionCommandPlan,
  normalizeCorrectionCommandPlan,
} from "../correction-command";

const schema = z.object({
  mustChange: z.array(z.string().min(1).max(300)).max(12).default([]),
  mustKeep: z.array(z.string().min(1).max(300)).max(16).default([]),
  forbiddenChanges: z.array(z.string().min(1).max(300)).max(16).default([]),
  referenceSources: z.array(z.string().min(1).max(300)).max(8).default([]),
  acceptanceCriteria: z.array(z.string().min(1).max(300)).max(16).default([]),
});

/**
 * 用咒语矫正模型（如 DeepSeek）把用户口语化的修改要求，
 * 改写成精确、严格按方向的修改指令，再交给图片生成模型执行。
 * 配置了矫正模型时使用模型改写；未配置时回退为原文，保证功能可用。
 */
export async function refineCorrectionRequest(
  request: string,
): Promise<CorrectionCommandPlan> {
  const fallback = deterministicCorrectionCommandPlan(request);
  try {
    const runtime = await resolveCorrectionModel();
    const result = await requestTextJson(
      runtime,
      "你是电商服装图片强制命令解析器。用户原文是最高优先级命令，绝不能弱化、概括掉数量、颜色、部位、方向、形状、增删动作或否定词。把每条命令拆成必须修改、必须保留、禁止修改、参考来源、验收条件。未指定区域默认保持原图。任何修改不得降低清晰度和真实感。只返回合法 JSON。",
      `用户原始咒语：${request}\n\n返回 {"mustChange":[],"mustKeep":[],"forbiddenChanges":[],"referenceSources":[],"acceptanceCriteria":[]}。要求：1）“扣子改成3个”必须保留部位、动作和数字，并生成“可见扣子恰好3个”的精确验收；2）“黑色边保持黑色”必须进入保留项；3）“只改这里/其余不变”必须进入禁止修改项；4）一句中有多个部位时逐条拆开；5）不得添加原文没有授权的修改。`,
    );
    const parsed = schema.safeParse(result);
    if (!parsed.success) return fallback;
    const value = parsed.data;
    return normalizeCorrectionCommandPlan({
      original: request,
      mustChange: [...fallback.mustChange, ...value.mustChange],
      mustKeep: [...fallback.mustKeep, ...value.mustKeep],
      forbiddenChanges: [
        ...fallback.forbiddenChanges,
        ...value.forbiddenChanges,
      ],
      referenceSources: [
        ...fallback.referenceSources,
        ...value.referenceSources,
      ],
      acceptanceCriteria: [
        ...fallback.acceptanceCriteria,
        ...value.acceptanceCriteria,
      ],
    });
  } catch {
    return fallback;
  }
}
