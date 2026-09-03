import "server-only";
import { z } from "zod";
import { resolveCorrectionModel } from "./provider-settings";
import { requestTextJson } from "./vision-chat";
import type {CorrectionCommandPlan} from "../correction-command";

const schema = z.object({
  mustChange:z.array(z.string().min(1).max(300)).max(12).default([]),
  mustKeep:z.array(z.string().min(1).max(300)).max(12).default([]),
  forbiddenChanges:z.array(z.string().min(1).max(300)).max(12).default([]),
  referenceSources:z.array(z.string().min(1).max(300)).max(8).default([]),
  acceptanceCriteria:z.array(z.string().min(1).max(300)).max(12).default([]),
});

/**
 * 用咒语矫正模型（如 DeepSeek）把用户口语化的修改要求，
 * 改写成精确、严格按方向的修改指令，再交给图片生成模型执行。
 * 配置了矫正模型时使用模型改写；未配置时回退为原文，保证功能可用。
 */
export async function refineCorrectionRequest(request: string): Promise<CorrectionCommandPlan> {
  const fallback:CorrectionCommandPlan={original:request,mustChange:[request],mustKeep:["未指定区域保持原图不变","保持原图高清画质与真实皮肤"],forbiddenChanges:["不得修改用户未指定区域","不得降低清晰度或改变人物身份"],referenceSources:["修正前图片","用户原始咒语"],acceptanceCriteria:[`必须可见地完成：${request}`,"未指定区域与修正前图片一致"]};
  try {
    const runtime = await resolveCorrectionModel();
    const result = await requestTextJson(
      runtime,
      "你是电商服装图片强制命令解析器。用户原文是最高优先级命令，绝不能弱化、概括掉数量/颜色/部位/否定词。把命令拆成必须修改、必须保留、禁止修改、参考来源、验收条件。未指定区域默认保持原图。任何修改不得降低清晰度和真实感。只返回合法 JSON。",
      `用户原始咒语：${request}\n\n返回 {"mustChange":[],"mustKeep":[],"forbiddenChanges":[],"referenceSources":[],"acceptanceCriteria":[]}。例如“扣子改成3个”必须原样成为可数验收条件；“黑色边保持黑色”必须进入保留项；不得添加与原意冲突的要求。`,
    );
    const parsed = schema.safeParse(result);
    if(!parsed.success)return fallback;
    const value=parsed.data;
    return {...fallback,...value,original:request,mustChange:value.mustChange.length?value.mustChange:fallback.mustChange,mustKeep:[...new Set([...value.mustKeep,...fallback.mustKeep])],forbiddenChanges:[...new Set([...value.forbiddenChanges,...fallback.forbiddenChanges])],referenceSources:value.referenceSources.length?value.referenceSources:fallback.referenceSources,acceptanceCriteria:value.acceptanceCriteria.length?value.acceptanceCriteria:fallback.acceptanceCriteria};
  } catch {
    return fallback;
  }
}
