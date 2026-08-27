import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runtimeDataDir } from "./runtime-paths";

/**
 * 商品识别结果缓存：同一张产品主图（按内容 Hash）识别成功后缓存，
 * 换装/三姿势/复色/QC 复用，避免重复调用视觉模型。只有主图变化或
 * 用户主动重新识别时才重新调用。
 */
const cacheDir = () => path.join(runtimeDataDir(), "product-analysis-cache");

export type ProductAnalysisCacheEntry = {
  imageHash: string;
  productType: string;
  attributes: Record<string, string>;
  detailDescription: string;
  protectionItems: string[];
  cachedAt: string;
};

function cacheFile(hash: string): string {
  return path.join(cacheDir(), `${hash}.json`);
}

export async function getCachedProductAnalysis(
  imageHash: string,
): Promise<ProductAnalysisCacheEntry | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(cacheFile(imageHash), "utf8")) as ProductAnalysisCacheEntry;
    if (parsed.imageHash !== imageHash) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function putCachedProductAnalysis(entry: ProductAnalysisCacheEntry): Promise<void> {
  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    const temporary = `${cacheFile(entry.imageHash)}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(entry));
    await fs.rename(temporary, cacheFile(entry.imageHash));
  } catch {
    // 缓存写入失败不影响识别主流程
  }
}

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
