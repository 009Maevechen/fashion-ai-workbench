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
const inflight = new Map<string, Promise<{ buffer: Buffer; mime: string }>>();

function contentHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function cachedPrepare(
  buffer: Buffer,
  prepare: (buffer: Buffer) => Promise<{ buffer: Buffer; mime: string }>,
): Promise<{ buffer: Buffer; mime: string; cached: boolean; hash: string }> {
  const hash = contentHash(buffer);
  const target = path.join(cacheRoot(), `${hash}.bin`);
  const metaTarget = path.join(cacheRoot(), `${hash}.json`);
  try {
    const [cached,meta] = await Promise.all([fs.readFile(target),fs.readFile(metaTarget,"utf8")]);
    const mime=JSON.parse(meta).mime;
    if(!["image/jpeg","image/png","image/webp"].includes(mime))throw new Error("invalid cache mime");
    return { buffer: cached, mime, cached: true, hash };
  } catch {
    // 兼容旧 JPEG 缓存；新缓存同时保存 MIME，避免把 PNG/WebP 错标为 JPEG。
    try{
      const legacy=await fs.readFile(path.join(cacheRoot(),`${hash}.jpg`));
      return {buffer:legacy,mime:"image/jpeg",cached:true,hash};
    }catch{}
  }
  // 同一批并行姿势/复色任务可能同时命中同一输入图；共享进行中的预处理，避免重复压缩。
  const pending = inflight.get(hash) || prepare(buffer);
  inflight.set(hash, pending);
  let prepared: { buffer: Buffer; mime: string };
  try {
    prepared = await pending;
  } finally {
    if (inflight.get(hash) === pending) inflight.delete(hash);
  }
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await Promise.all([fs.writeFile(target, prepared.buffer),fs.writeFile(metaTarget,JSON.stringify({mime:prepared.mime}))]);
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
