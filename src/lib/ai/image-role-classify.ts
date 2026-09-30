import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import type { IndexedImageType } from "../sku-production";
import { resolveProductAnalysisModel } from "./provider-settings";
import { requestVisionJson } from "./vision-chat";
import { toDataUrl } from "./storage";
import { resizeToJpeg } from "../image-limits";
import { findIndexedImageByHash, saveIndexedRoleAnalysis } from "../image-index";
import { acquireProviderSlot } from "../provider-concurrency";

const schema = z.object({
  role: z.enum(["product", "model", "pose", "color", "detail", "unknown"]),
  confidence: z.coerce.number().min(0).max(1),
  reason: z.string().max(300).optional().default(""),
});

const ROLE_MAP: Record<string, IndexedImageType> = {
  product: "product",
  model: "model",
  pose: "pose",
  color: "color",
  detail: "supplemental",
  unknown: "unknown",
};

export type ClassifiedImageRole = { role: IndexedImageType; confidence: number; reason?: string; cached: boolean };

/** 低于该置信度视为不确定，进入 NEEDS_REVIEW，禁止乱配。 */
export const ROLE_CONFIDENCE_THRESHOLD = 0.6;

/**
 * AI 图片角色分类：product / model / pose / color / detail / unknown。
 * 按内容哈希缓存，同一张图不重复调用 AI；AI 并发受控。
 */
export async function classifyImageRole(
  buffer: Buffer,
  context: { sku: string; imageId?: string; title?: string },
): Promise<ClassifiedImageRole> {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const cached = await findIndexedImageByHash(hash);
  if (cached?.roleAnalysis) return { role: cached.roleAnalysis.role, confidence: cached.roleAnalysis.confidence, reason: cached.roleAnalysis.reason, cached: true };

  const runtime = await resolveProductAnalysisModel();
  const compact = await resizeToJpeg(buffer, 1024, 82);
  const release = await acquireProviderSlot(`${runtime.id}:${runtime.model}`, 2);
  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(
      await requestVisionJson(
        runtime,
        toDataUrl(compact, "image/jpeg"),
        "你是电商服装图片角色分类器。只判断图片用途，必须只返回合法 JSON，不确定时返回 unknown，绝不猜测。",
        `判断这张图片属于哪一种角色：\n- product：产品服装图（平铺 / 挂拍 / 展示商品本身）\n- model：模特参考图（真人模特全身或半身照）\n- pose：姿势参考图（用于模仿动作姿势的模板图）\n- color：颜色参考图（色卡 / 多色平铺 / 色号图）\n- detail：细节图（领口 / 袖口 / 纽扣 / 面料等特写）\n- unknown：无法可靠判断\n商品标题：${context.title || "未提供"}。\n返回 {"role":"","confidence":0到1,"reason":""}，置信度低于 0.6 一律用 unknown。`,
      ),
    );
  } finally {
    release();
  }
  const role = ROLE_MAP[parsed.role] || "unknown";
  const confidence = parsed.confidence;
  const reason = parsed.reason || undefined;
  if (context.imageId) await saveIndexedRoleAnalysis(context.imageId, { role, confidence, reason, analyzedAt: new Date().toISOString(), model: `${runtime.id}:${runtime.model}` }).catch(() => {});
  return { role, confidence, reason, cached: false };
}
