import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runtimeVisualReferenceDir } from "./runtime-paths";
import { normalizeFace, normalizeProductType, normalizeShot } from "./pose-inventory-utils";

export type VisualReferenceImage = {
  id: string;
  /** 相对图库根目录的路径 */
  relativePath: string;
  fileName: string;
  productType?: string;
  productSubtype?: string;
  poseType?: string;
  shotType?: string;
  faceVisible?: boolean;
  displayFocus?: string;
  composition?: string;
  styleTags?: string[];
  suitableProductTypes?: string[];
  source?: string;
  imageHash?: string;
  /** 低置信度或无法可靠判断时标记待确认 */
  needsReview: boolean;
  recognizedAt?: string;
};

export type VisualReferencePoseGroup = {
  id: string;
  poseGroupId: string;
  folderName: string;
  folderRelativePath: string;
  coverPath?: string;
  pose01Path?: string;
  pose02Path?: string;
  pose03Path?: string;
  productType?: string;
  productSubtype?: string;
  shotType?: string;
  faceVisible?: boolean;
  displayFocus?: string;
  tags?: string;
  source?: string;
  missingImages?: string[];
  needsReview?: boolean;
  updatedAt: string;
};

export type VisualReferenceManifest = {
  schemaVersion: 1;
  libraryDir: string;
  updatedAt: string;
  images: VisualReferenceImage[];
  poseGroups: VisualReferencePoseGroup[];
};

const MANIFEST_NAME = "visual-reference-manifest.json";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const COVER_NAMES = ["cover.jpg", "cover.png", "cover.webp", "封面.jpg", "封面.png"];
const POSE_NAMES = [
  ["pose01.jpg", "pose01.png", "pose01.webp", "姿势01.jpg", "姿势1.jpg", "1.jpg", "01.jpg"],
  ["pose02.jpg", "pose02.png", "pose02.webp", "姿势02.jpg", "姿势2.jpg", "2.jpg", "02.jpg"],
  ["pose03.jpg", "pose03.png", "pose03.webp", "姿势03.jpg", "姿势3.jpg", "3.jpg", "03.jpg"],
];

export function visualReferenceManifestFile(): string {
  return path.join(runtimeVisualReferenceDir(), MANIFEST_NAME);
}

export async function readVisualReferenceManifest(): Promise<VisualReferenceManifest> {
  try {
    const parsed = JSON.parse(await fs.readFile(visualReferenceManifestFile(), "utf8")) as Partial<VisualReferenceManifest>;
    return {
      schemaVersion: 1,
      libraryDir: parsed.libraryDir || runtimeVisualReferenceDir(),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      images: Array.isArray(parsed.images) ? parsed.images : [],
      poseGroups: Array.isArray(parsed.poseGroups) ? parsed.poseGroups : [],
    };
  } catch {
    return { schemaVersion: 1, libraryDir: runtimeVisualReferenceDir(), updatedAt: new Date().toISOString(), images: [], poseGroups: [] };
  }
}

export async function writeVisualReferenceManifest(manifest: VisualReferenceManifest): Promise<void> {
  await fs.mkdir(runtimeVisualReferenceDir(), { recursive: true });
  const tmp = `${visualReferenceManifestFile()}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ ...manifest, libraryDir: runtimeVisualReferenceDir(), updatedAt: new Date().toISOString() }, null, 2));
  await fs.rename(tmp, visualReferenceManifestFile());
}

async function findFile(dir: string, names: string[]): Promise<string | undefined> {
  for (const name of names) {
    try {
      await fs.access(path.join(dir, name));
      return name;
    } catch { /* continue */ }
  }
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      for (const name of names) {
        if (lower.startsWith(name.toLowerCase().split(".")[0])) return entry;
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

async function walkImages(dir: string, root: string, out: { relativePath: string; fileName: string }[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkImages(full, root, out);
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push({ relativePath: path.relative(root, full).split(path.sep).join("/"), fileName: entry.name });
    }
  }
}

/** 扫描图库文件夹，识别姿势模板组（含 cover+pose01/02/03）和散图。 */
export async function scanVisualReferenceLibrary(): Promise<{ images: Array<{ relativePath: string; fileName: string }>; groups: Array<{ folderRelativePath: string; folderName: string; cover?: string; pose01?: string; pose02?: string; pose03?: string; missing: string[] }> }> {
  const root = runtimeVisualReferenceDir();
  await fs.mkdir(root, { recursive: true });
  const images: Array<{ relativePath: string; fileName: string }> = [];
  const groups: Array<{ folderRelativePath: string; folderName: string; cover?: string; pose01?: string; pose02?: string; pose03?: string; missing: string[] }> = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return { images, groups };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const cover = await findFile(dir, COVER_NAMES);
    const pose01 = await findFile(dir, POSE_NAMES[0]);
    const pose02 = await findFile(dir, POSE_NAMES[1]);
    const pose03 = await findFile(dir, POSE_NAMES[2]);
    const missing: string[] = [];
    if (!pose01) missing.push("pose01.jpg");
    if (!pose02) missing.push("pose02.jpg");
    if (!pose03) missing.push("pose03.jpg");
    // 有封面或任一张姿势图，视为姿势模板组
    if (cover || pose01 || pose02 || pose03) {
      groups.push({
        folderRelativePath: entry.name,
        folderName: entry.name,
        cover: cover ? `${entry.name}/${cover}` : undefined,
        pose01: pose01 ? `${entry.name}/${pose01}` : undefined,
        pose02: pose02 ? `${entry.name}/${pose02}` : undefined,
        pose03: pose03 ? `${entry.name}/${pose03}` : undefined,
        missing,
      });
    }
    await walkImages(dir, root, images);
  }
  // 图库根目录下的散图（非模板组文件夹内）
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      images.push({ relativePath: entry.name, fileName: entry.name });
    }
  }
  return { images, groups };
}

export async function resolveVisualReferenceImage(relativePath: string): Promise<string> {
  const root = runtimeVisualReferenceDir();
  const target = path.resolve(root, relativePath);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error("非法图片路径");
  return target;
}

export function imageSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** 从识别结果更新/插入单张图片索引。 */
export function upsertImageIndex(manifest: VisualReferenceManifest, image: VisualReferenceImage): VisualReferenceManifest {
  const index = manifest.images.findIndex((item) => item.relativePath === image.relativePath);
  if (index >= 0) manifest.images[index] = image;
  else manifest.images.push(image);
  return manifest;
}

export { normalizeFace, normalizeProductType, normalizeShot };
