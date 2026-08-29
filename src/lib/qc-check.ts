import "server-only";
import sharp from "sharp";
import type { Project } from "./db";
import { localImage, storageStats } from "./ai/storage";
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

/**
 * 商品流程文件已改为长期保存。保留这个兼容函数避免旧调用崩溃，但绝不再删除 SKU 目录。
 */
export async function cleanupSkuTemp(sku: string): Promise<number> {
  void sku;
  return 0;
}

export function canAutoCleanTemp(project: Project): boolean {
  void project;
  return false;
}
