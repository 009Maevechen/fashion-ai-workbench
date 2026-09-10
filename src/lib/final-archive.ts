import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Job, Project } from "./db";
import { localImage } from "./ai/storage";
import { runtimeFinalDir } from "./runtime-paths";
import { imageSha256, upsertManifestImage, type ManifestImage } from "./manifest";
import { recolorColorsWithSavedJobs } from "./recolor-collection";
import { normalizedColorName } from "./color-sets";
import {durableWriteFile} from "./durable-json";

/** 清理 Windows 非法字符，保留中文、字母、数字、下划线、连字符、点。 */
export function readableSegment(value: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 80) || "未命名";
}

function uniquePath(dir: string, base: string, ext: string, used: Set<string>): string {
  let candidate = `${base}${ext}`;
  let version = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${version}${ext}`;
    version += 1;
  }
  used.add(candidate);
  return path.join(dir, candidate);
}

type ArchiveEntry = {
  url: string;
  color: string;
  poseIndex: number;
};

export function collectFinalEntries(project: Project, jobs: Job[]): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  const colors = recolorColorsWithSavedJobs(project, jobs);
  const productName = readableSegment(project.productName || project.sku);
  const dirName = `${readableSegment(project.sku)}_${productName}`;
  if (colors.length) {
    for (const color of colors) {
      const colorName = normalizedColorName(color) || "未命名颜色";
      for (const [index, url] of (color.poseResults || []).entries()) {
        if (!url) continue;
        entries.push({ url, color: readableSegment(colorName), poseIndex: index + 1 });
      }
    }
    // 原色（确认的姿势图）也纳入最终成品
    for (const [index, url] of (project.confirmedPoseImages || []).entries()) {
      if (!url) continue;
      entries.push({ url, color: "原色", poseIndex: index + 1 });
    }
  } else {
    for (const [index, url] of (project.confirmedPoseImages || []).entries()) {
      if (!url) continue;
      entries.push({ url, color: "原色", poseIndex: index + 1 });
    }
  }
  void dirName;
  return entries;
}

export async function archiveFinalDeliverables(
  project: Project,
  jobs: Job[],
): Promise<{ archived: ManifestImage[]; dir: string }> {
  const root = runtimeFinalDir();
  const productName = readableSegment(project.productName || project.sku);
  const sku = readableSegment(project.sku);
  const entries = collectFinalEntries(project, jobs);
  const archived: ManifestImage[] = [];
  const used = new Set<string>();
  const now = new Date().toISOString();

  for (const entry of entries) {
    const colorDir = entry.color;
    const dir = path.join(root, `${sku}_${productName}`, colorDir);
    await fs.mkdir(dir, { recursive: true });
    let buffer: Buffer;
    try {
      buffer = await localImage(entry.url);
    } catch {
      continue;
    }
    const base = `${sku}_${productName}_${entry.color}_姿势${String(entry.poseIndex).padStart(2, "0")}`;
    const extension = /\.(png|webp)$/i.exec(entry.url)?.[0].toLowerCase() || ".jpg";
    const target = uniquePath(dir, base, extension, used);
    await durableWriteFile(target,buffer);
    const relativePath = path.relative(root, target).split(path.sep).join("/");
    archived.push({
      imageId: crypto.randomUUID(),
      filename: path.basename(target),
      relativePath,
      sku: project.sku,
      productName: project.productName,
      productType: project.productType,
      color: entry.color,
      poseIndex: entry.poseIndex,
      imageType: "final",
      createdAt: now,
      imageHash: imageSha256(buffer),
    });
    await upsertManifestImage(root, archived[archived.length - 1]);
  }
  return { archived, dir: root };
}

export async function openFinalDir(): Promise<string> {
  const dir = runtimeFinalDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
