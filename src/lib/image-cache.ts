import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runtimeOutputsDir } from "./runtime-paths";

/**
 * 图片预处理缓存：商品图/模特图/姿势图第一次完成 EXIF 修正、格式转换、
 * Hash 计算后，按内容 Hash 缓存到临时目录，后续任务直接复用，避免重复
 * 读取→压缩→Base64→格式转换。
 */
const cacheRoot = () => path.join(runtimeOutputsDir(), ".cache", "preprocess");

function contentHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function cachedPrepare(
  buffer: Buffer,
  prepare: (buffer: Buffer) => Promise<{ buffer: Buffer; mime: string }>,
): Promise<{ buffer: Buffer; mime: string; cached: boolean; hash: string }> {
  const hash = contentHash(buffer);
  const target = path.join(cacheRoot(), `${hash}.jpg`);
  try {
    const cached = await fs.readFile(target);
    return { buffer: cached, mime: "image/jpeg", cached: true, hash };
  } catch {
    // 未命中，执行真实预处理并写入缓存
  }
  const prepared = await prepare(buffer);
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, prepared.buffer);
  } catch {
    // 缓存写入失败不影响主流程
  }
  return { ...prepared, cached: false, hash };
}

export async function clearPreprocessCache(): Promise<number> {
  const root = cacheRoot();
  try {
    await fs.rm(root, { recursive: true, force: true });
    return 1;
  } catch {
    return 0;
  }
}
