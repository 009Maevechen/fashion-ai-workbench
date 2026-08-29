import "server-only";
import { z } from "zod";
import { resolveCorrectionModel } from "./provider-settings";
import { requestTextJson } from "./vision-chat";

const schema = z.object({
  correction: z.string().min(1).max(1200),
});

/**
 * 用咒语矫正模型（如 DeepSeek）把用户口语化的修改要求，
 * 改写成精确、严格按方向的修改指令，再交给图片生成模型执行。
 * 配置了矫正模型时使用模型改写；未配置时回退为原文，保证功能可用。
 */
export async function refineCorrectionRequest(request: string): Promise<string> {
  try {
    const runtime = await resolveCorrectionModel();
    const result = await requestTextJson(
      runtime,
      "你是电商服装图片修改指令精修助手。把用户口语化的修改要求改写成一段精确、可直接执行的图片修改指令。只描述用户明确要求改的方向，不得擅自增加未要求的变化；必须明确写出“只修改 X，其余保持不变”的范围边界；保留原商品版型、材质、纹理、颜色、包边、结构、人物、姿势、构图、背景等未提及的内容。只返回合法 JSON，字段名为 correction。",
      `用户要求：${request}\n\n返回 {"correction":"精修后的修改指令"}，指令用一句话或多句话写清：要改什么、往哪个方向改、边界是什么。`,
    );
    const parsed = schema.safeParse(result);
    const refined = parsed.success ? parsed.data.correction.trim() : "";
    return refined || request;
  } catch {
    return request;
  }
}
