import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PoseFaceMode, PoseShotType, ProductType } from "./db";
import { runtimePoseLibraryDir } from "./runtime-paths";
import { normalizeFace, normalizeProductType, normalizeShot } from "./pose-inventory-utils";
export { normalizeFace, normalizeProductType, normalizeShot, recommendGroups, searchGroups } from "./pose-inventory-utils";

export type PoseInventoryGroup = {
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
  displayFocus?: string;
  shotType?: string;
  faceVisible?: boolean;
  pose1Description?: string;
  pose2Description?: string;
  pose3Description?: string;
  source?: string;
  tags?: string;
  notes?: string;
  missingImages?: string[];
  updatedAt: string;
};

export type PoseInventoryManifest = {
  schemaVersion: 1;
  libraryDir: string;
  updatedAt: string;
  groups: PoseInventoryGroup[];
};

const MANIFEST_NAME = "pose-library-manifest.json";
const COVER_NAMES = ["cover.jpg", "cover.png", "cover.webp", "封面.jpg", "封面.png"];
const POSE_NAMES = [
  ["pose01.jpg", "pose01.png", "pose01.webp", "姿势01.jpg", "姿势1.jpg", "1.jpg", "01.jpg"],
  ["pose02.jpg", "pose02.png", "pose02.webp", "姿势02.jpg", "姿势2.jpg", "2.jpg", "02.jpg"],
  ["pose03.jpg", "pose03.png", "pose03.webp", "姿势03.jpg", "姿势3.jpg", "3.jpg", "03.jpg"],
];

const PRODUCT_TYPES: ProductType[] = ["上衣", "裤装", "连衣裙", "半身裙", "套装"];

async function findFile(dir: string, names: string[]): Promise<string | undefined> {
  for (const name of names) {
    try {
      await fs.access(path.join(dir, name));
      return name;
    } catch {
      // continue
    }
  }
  // 兜底：按前缀匹配
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      for (const name of names) {
        const base = name.toLowerCase();
        if (lower.startsWith(base.split(".")[0])) return entry;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

function manifestFile(): string {
  return path.join(runtimePoseLibraryDir(), MANIFEST_NAME);
}

export async function readManifest(): Promise<PoseInventoryManifest> {
  try {
    const parsed = JSON.parse(await fs.readFile(manifestFile(), "utf8")) as Partial<PoseInventoryManifest>;
    return {
      schemaVersion: 1,
      libraryDir: parsed.libraryDir || runtimePoseLibraryDir(),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    };
  } catch {
    return { schemaVersion: 1, libraryDir: runtimePoseLibraryDir(), updatedAt: new Date().toISOString(), groups: [] };
  }
}

export async function writeManifest(manifest: PoseInventoryManifest): Promise<void> {
  await fs.mkdir(runtimePoseLibraryDir(), { recursive: true });
  const tmp = `${manifestFile()}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ ...manifest, libraryDir: runtimePoseLibraryDir(), updatedAt: new Date().toISOString() }, null, 2));
  await fs.rename(tmp, manifestFile());
}

/** 扫描一个姿势组文件夹，读取封面与3张姿势图，返回相对路径（不含图片字节）。 */
async function scanGroupFolder(dir: string): Promise<{
  cover?: string;
  pose01?: string;
  pose02?: string;
  pose03?: string;
  missing: string[];
}> {
  const cover = await findFile(dir, COVER_NAMES);
  const pose01 = await findFile(dir, POSE_NAMES[0]);
  const pose02 = await findFile(dir, POSE_NAMES[1]);
  const pose03 = await findFile(dir, POSE_NAMES[2]);
  const missing: string[] = [];
  if (!pose01) missing.push("pose01.jpg");
  if (!pose02) missing.push("pose02.jpg");
  if (!pose03) missing.push("pose03.jpg");
  return { cover, pose01, pose02, pose03, missing };
}

/** 重新扫描整个姿势库文件夹，根据已有表格元数据重建图片路径。 */
export async function rescanLibrary(): Promise<PoseInventoryManifest> {
  const manifest = await readManifest();
  const root = runtimePoseLibraryDir();
  const now = new Date().toISOString();
  const groups: PoseInventoryGroup[] = [];
  for (const group of manifest.groups) {
    const dir = path.join(root, group.folderRelativePath);
    const scanned = await scanGroupFolder(dir);
    groups.push({
      ...group,
      coverPath: scanned.cover ? `${group.folderRelativePath}/${scanned.cover}` : undefined,
      pose01Path: scanned.pose01 ? `${group.folderRelativePath}/${scanned.pose01}` : undefined,
      pose02Path: scanned.pose02 ? `${group.folderRelativePath}/${scanned.pose02}` : undefined,
      pose03Path: scanned.pose03 ? `${group.folderRelativePath}/${scanned.pose03}` : undefined,
      missingImages: scanned.missing,
      updatedAt: now,
    });
  }
  const next: PoseInventoryManifest = { ...manifest, groups, updatedAt: now };
  await writeManifest(next);
  return next;
}

export type TableRow = Record<string, string>;

/** 从表格行导入姿势组，按文件夹名称匹配本地图片。 */
export async function importFromTable(rows: TableRow[]): Promise<{
  manifest: PoseInventoryManifest;
  imported: number;
  issues: string[];
}> {
  const root = runtimePoseLibraryDir();
  const existing = await readManifest();
  const byFolder = new Map(existing.groups.map((group) => [group.folderName, group]));
  const issues: string[] = [];
  let imported = 0;
  const now = new Date().toISOString();

  const field = (row: TableRow, keys: string[]): string | undefined => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null) return row[key].trim();
    }
    return undefined;
  };

  for (const row of rows) {
    const folderName = field(row, ["文件夹名称", "文件夹", "folder", "folderName", "folder_name"]) || "";
    const poseGroupId = field(row, ["姿势组ID", "姿势组id", "组ID", "id", "poseGroupId", "group_id", "姿势组"]) || folderName || crypto.randomUUID();
    if (!folderName) {
      issues.push("存在缺少“文件夹名称”的行，已跳过");
      continue;
    }
    const folderRelativePath = folderName.replace(/[\\/]+/g, "/").replace(/^\.\/+/, "");
    const dir = path.join(root, folderRelativePath);
    let scanned: Awaited<ReturnType<typeof scanGroupFolder>>;
    try {
      scanned = await scanGroupFolder(dir);
    } catch {
      issues.push(`${folderName}：文件夹不存在或无法读取`);
      continue;
    }
    const group: PoseInventoryGroup = {
      id: byFolder.get(folderName)?.id || crypto.randomUUID(),
      poseGroupId,
      folderName,
      folderRelativePath,
      coverPath: scanned.cover ? `${folderRelativePath}/${scanned.cover}` : undefined,
      pose01Path: scanned.pose01 ? `${folderRelativePath}/${scanned.pose01}` : undefined,
      pose02Path: scanned.pose02 ? `${folderRelativePath}/${scanned.pose02}` : undefined,
      pose03Path: scanned.pose03 ? `${folderRelativePath}/${scanned.pose03}` : undefined,
      productType: normalizeProductType(field(row, ["商品类型", "商品类型/类别", "productType", "category"])) || field(row, ["商品类型", "productType", "category"]),
      productSubtype: field(row, ["商品子类", "子类", "productSubtype", "subtype", "sub_category"]),
      displayFocus: field(row, ["展示重点", "重点", "displayFocus", "focus"]),
      shotType: normalizeShot(field(row, ["景别", "shotType", "shot", "景别/镜头"])),
      faceVisible: normalizeFace(field(row, ["是否露脸", "露脸", "faceVisible", "face", "是否露脸(是/否)"])) ,
      pose1Description: field(row, ["姿势1描述", "姿势一", "pose1", "pose1Description"]),
      pose2Description: field(row, ["姿势2描述", "姿势二", "pose2", "pose2Description"]),
      pose3Description: field(row, ["姿势3描述", "姿势三", "pose3", "pose3Description"]),
      source: field(row, ["来源", "source", "出处"]),
      tags: field(row, ["标签", "tags", "tag"]),
      notes: field(row, ["备注", "notes", "note", "说明"]),
      missingImages: scanned.missing,
      updatedAt: now,
    };
    byFolder.set(folderName, group);
    for (const missing of scanned.missing) issues.push(`${folderName}：${missing} 缺失`);
    imported += 1;
  }
  const manifest: PoseInventoryManifest = {
    schemaVersion: 1,
    libraryDir: root,
    updatedAt: now,
    groups: [...byFolder.values()],
  };
  await writeManifest(manifest);
  return { manifest, imported, issues };
}

export async function listInventory(): Promise<PoseInventoryManifest> {
  return readManifest();
}

export async function getInventoryGroup(id: string): Promise<PoseInventoryGroup | undefined> {
  const manifest = await readManifest();
  return manifest.groups.find((group) => group.id === id);
}

/** 校验本地图片读取路径，禁止越出姿势库目录。 */
export function resolveLocalImage(relativePath: string): string {
  const root = runtimePoseLibraryDir();
  const target = path.resolve(root, relativePath);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error("非法图片路径");
  return target;
}

export function productTypes(): ProductType[] {
  return PRODUCT_TYPES;
}

export const SHOT_LABEL: Record<string, string> = {
  "全身": "全身",
  "半身": "半身",
  "上半身": "上半身",
  "下半身": "下半身",
};
export const FACE_LABEL: Record<string, string> = { "true": "露脸", "false": "不露脸" };
export { type PoseFaceMode, type PoseShotType };
