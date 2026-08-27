import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Project } from "./db";
import { localImage, storageStats } from "./ai/storage";
import { runtimeOutputsDir } from "./runtime-paths";
import { readableSegment } from "./final-archive";
import { sha } from "./ai/validators";

/** 第一层 QC：纯本地检查，不依赖 AI。返回问题描述数组。 */
export async function localQcChecks(urls: string[]): Promise<string[]> {
  const problems: string[] = [];
  const hashes = new Set<string>();
  for (let index = 0; index < urls.length; index++) {
    const url = urls[index];
    const label = `第${index + 1}张`;
    if (!url) {
      problems.push(`${label}：图片不存在`);
      continue;
    }
    let buffer: Buffer;
    try {
      buffer = await localImage(url);
    } catch {
      problems.push(`${label}：无法读取图片文件`);
      continue;
    }
    if (buffer.length < 1024 || buffer.length > 30 * 1024 * 1024) {
      problems.push(`${label}：文件大小异常`);
    }
    let meta: sharp.Metadata;
    try {
      meta = await sharp(buffer).metadata();
    } catch {
      problems.push(`${label}：图片损坏或无法解码`);
      continue;
    }
    if (!meta.width || !meta.height) {
      problems.push(`${label}：缺少有效尺寸`);
      continue;
    }
    const ratio = meta.width / meta.height;
    if (Math.abs(ratio - 0.75) > 0.12) {
      problems.push(`${label}：比例 ${ratio.toFixed(2)} 偏离 3:4`);
    }
    if (ratio > 1.25) {
      problems.push(`${label}：横向宽图，疑似拼图或多宫格`);
    }
    const hash = sha(buffer);
    if (hashes.has(hash)) {
      problems.push(`${label}：与其他结果图片完全重复`);
    }
    hashes.add(hash);
  }
  return problems;
}

export async function imageDecodes(url: string): Promise<boolean> {
  try {
    const buffer = await localImage(url);
    const meta = await sharp(buffer).metadata();
    return Boolean(meta.width && meta.height);
  } catch {
    return false;
  }
}

export async function tempStorageStats() {
  return storageStats();
}

/** 清理 SKU 对应的临时目录。返回删除的字节估算。 */
export async function cleanupSkuTemp(sku: string): Promise<number> {
  const root = runtimeOutputsDir();
  const target = path.resolve(root, readableSegment(sku));
  if (!target.startsWith(root + path.sep)) return 0;
  let bytes = 0;
  async function size(dir: string): Promise<number> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      let total = 0;
      for (const entry of entries) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) total += await size(p);
        else total += (await fs.stat(p)).size;
      }
      return total;
    } catch {
      return 0;
    }
  }
  bytes = await size(target);
  await fs.rm(target, { recursive: true, force: true });
  return bytes;
}

export function canAutoCleanTemp(project: Project): boolean {
  return project.status === "已完成";
}
