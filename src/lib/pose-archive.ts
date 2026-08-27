import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { PoseShotType, PoseTemplateGroup, ProductType } from "./db";
import { runtimePoseLibraryDir } from "./runtime-paths";
import { imagePerceptualHash } from "./pose-library";
import { imageSha256, readManifest, upsertManifestImage, type ManifestImage } from "./manifest";
import { readableSegment } from "./final-archive";

export const SHOT_LABEL: Record<PoseShotType, string> = {
  full_body: "全身",
  half_body: "半身",
  upper_body: "上半身",
  lower_body: "下半身",
};
export const PRODUCT_TYPE_FOLDER: Record<ProductType, string> = {
  上衣: "上衣",
  裤装: "裤装",
  连衣裙: "连衣裙",
  半身裙: "半身裙",
  套装: "套装",
};

function typeFolder(productTypes: ProductType[]): string {
  return readableSegment(productTypes[0] ? PRODUCT_TYPE_FOLDER[productTypes[0]] : "其他");
}

/**
 * 把一组姿势模板归档到姿势库目录：按商品类型分目录、可读命名、去重，并写入 manifest。
 * 返回归档结果，供调用方判断是否已存在完全相同/高度相似的姿势。
 */
export async function archivePoseGroup(group: PoseTemplateGroup): Promise<{
  archived: ManifestImage[];
  skipped: number;
  duplicates: number;
}> {
  const root = runtimePoseLibraryDir();
  const folder = typeFolder(group.productTypes);
  const dir = path.join(root, folder);
  await fs.mkdir(dir, { recursive: true });
  const manifest = await readManifest(root);
  const existingByHash = new Map(manifest.images.map((item) => [item.imageHash, item]));
  const existingPerceptual = manifest.images.map((item) => ({ hash: item.perceptualHash, path: item.relativePath }));
  const used = new Set<string>();
  const archived: ManifestImage[] = [];
  let skipped = 0;
  let duplicates = 0;
  const now = new Date().toISOString();
  const faceLabel = group.faceMode === "visible" ? "露脸" : "不露脸";
  const shotLabel = SHOT_LABEL[group.shotType] || "通用";

  for (let index = 0; index < group.poses.length; index++) {
    const pose = group.poses[index];
    if (!pose.referenceImagePath) continue;
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(pose.referenceImagePath);
    } catch {
      continue;
    }
    await sharp(buffer).metadata().catch(() => {
      throw new Error(`姿势参考图无法解码`);
    });
    const hash = imageSha256(buffer);
    const perceptualHash = pose.perceptualHash || (await imagePerceptualHash(buffer));
    if (existingByHash.has(hash)) {
      skipped += 1;
      continue;
    }
    const near = existingPerceptual.find((item) => item.hash && distance(item.hash, perceptualHash) <= 3);
    if (near) {
      duplicates += 1;
      continue;
    }
    const base = `${readableSegment(group.productTypes[0] || "其他")}_${shotLabel}_${readableSegment(pose.name || `姿势${index + 1}`)}_${faceLabel}`;
    let filename = `${base}_001.jpg`;
    let version = 1;
    while (used.has(filename) || (await fs.access(path.join(dir, filename)).then(() => true, () => false))) {
      version += 1;
      filename = `${base}_${String(version).padStart(3, "0")}.jpg`;
    }
    used.add(filename);
    const target = path.join(dir, filename);
    await fs.writeFile(target, buffer);
    const relativePath = path.relative(root, target).split(path.sep).join("/");
    const entry: ManifestImage = {
      imageId: crypto.randomUUID(),
      filename,
      relativePath,
      productType: group.productTypes[0],
      poseIndex: index + 1,
      poseLabels: [pose.name || ""],
      imageType: "pose",
      shotType: group.shotType,
      faceMode: group.faceMode,
      displayFocus: group.displayFocus || [],
      createdAt: now,
      imageHash: hash,
      perceptualHash,
    };
    archived.push(entry);
    existingByHash.set(hash, entry);
    existingPerceptual.push({ hash: perceptualHash, path: relativePath });
    await upsertManifestImage(root, entry);
  }
  return { archived, skipped, duplicates };
}

function distance(a: string | undefined, b: string): number {
  if (!a || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    let value = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (value) {
      result += value & 1;
      value >>= 1;
    }
  }
  return result;
}

export async function listPoseLibraryArchive(): Promise<{ dir: string; manifest: import("./manifest").Manifest }> {
  const dir = runtimePoseLibraryDir();
  const manifest = await readManifest(dir);
  return { dir, manifest };
}
