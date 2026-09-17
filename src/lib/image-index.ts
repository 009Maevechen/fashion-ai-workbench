import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { durableWriteJson, readValidJson } from "./durable-json";
import { runtimeDataDir } from "./runtime-paths";
import type { IndexedImageType } from "./sku-production";
import type { GarmentProductionProfile } from "./sku-production";
import type { GarmentDetailLock } from "./db";

export type ImageIndexEntry = {
  imageId: string;
  sku: string;
  linkedSkus?: string[];
  filePath: string;
  hash: string;
  type: IndexedImageType;
  updatedAt: string;
  size?: number;
  mime?: string;
  exists: boolean;
  garmentAnalysis?: { profile: GarmentProductionProfile; lock: GarmentDetailLock; analyzedAt: string };
};

type ImageIndexStore = { schemaVersion: 1; images: ImageIndexEntry[] };
const file = path.join(runtimeDataDir(), "image-index.json");
let queue = Promise.resolve();

function isStore(value: unknown): value is ImageIndexStore {
  const item = value as Partial<ImageIndexStore> | null;
  return Boolean(item && Array.isArray(item.images));
}

async function load(): Promise<ImageIndexStore> {
  try {
    return await readValidJson(file, isStore);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, images: [] };
    throw error;
  }
}

async function save(store: ImageIndexStore) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await durableWriteJson(file, store);
}

function normalizePath(raw: string, baseDirectory?: string) {
  const value = raw.trim().replace(/^['"]|['"]$/g, "");
  if (value.startsWith("file://")) return path.normalize(fileURLToPath(value));
  if (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) return path.normalize(value);
  return baseDirectory ? path.resolve(baseDirectory, value) : path.normalize(value);
}

async function hashFile(filePath: string) {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function mimeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
}

export async function indexLocalImage(input: { sku: string; filePath: string; type: IndexedImageType; baseDirectory?: string }) {
  const filePath = normalizePath(input.filePath, input.baseDirectory);
  let stat: Awaited<ReturnType<typeof fsp.stat>> | undefined;
  try {
    stat = await fsp.stat(filePath);
    if (!stat.isFile()) stat = undefined;
  } catch {}
  const hash = stat ? await hashFile(filePath) : crypto.createHash("sha256").update(`missing:${filePath}`).digest("hex");
  let result!: ImageIndexEntry;
  queue = queue.then(async () => {
    const store = await load();
    const normalized = process.platform === "win32" ? filePath.toLocaleLowerCase() : filePath;
    const existing = store.images.find((item) => item.hash === hash && item.exists === Boolean(stat)) || store.images.find((item) => (process.platform === "win32" ? item.filePath.toLocaleLowerCase() : item.filePath) === normalized);
    const now = new Date().toISOString();
    result = existing || { imageId: crypto.randomUUID(), sku: input.sku, filePath, hash, type: input.type, updatedAt: now, exists: Boolean(stat) };
    Object.assign(result, { linkedSkus: [...new Set([...(result.linkedSkus || [result.sku]), input.sku])], filePath, hash, type: input.type, updatedAt: now, exists: Boolean(stat), size: stat?.size, mime: mimeFromPath(filePath) });
    if (!existing) store.images.push(result);
    await save(store);
  });
  await queue;
  return result;
}

export async function getIndexedImage(imageId: string) {
  return (await load()).images.find((item) => item.imageId === imageId);
}

export async function listIndexedImages(sku?: string) {
  const images = (await load()).images;
  return sku ? images.filter((item) => [item.sku, ...(item.linkedSkus || [])].some((value) => value.toLocaleLowerCase() === sku.toLocaleLowerCase())) : images;
}

export async function saveIndexedGarmentAnalysis(imageId: string, analysis: NonNullable<ImageIndexEntry["garmentAnalysis"]>) {
  let result!: ImageIndexEntry;
  queue = queue.then(async () => {
    const store = await load();
    const entry = store.images.find((item) => item.imageId === imageId);
    if (!entry) throw new Error("图片索引不存在");
    entry.garmentAnalysis = analysis;
    entry.updatedAt = new Date().toISOString();
    result = entry;
    await save(store);
  });
  await queue;
  return result;
}

export async function readIndexedImage(imageId: string) {
  const entry = await getIndexedImage(imageId);
  if (!entry) throw new Error("图片索引不存在");
  if (!entry.exists) throw new Error(`原始图片不存在或路径已失效：${entry.filePath}`);
  try {
    return { entry, buffer: await fsp.readFile(entry.filePath) };
  } catch (error) {
    throw new Error(`无法读取原始图片：${error instanceof Error ? error.message : "文件系统错误"}`);
  }
}

export function indexedImageUrl(imageId: string) {
  return `/api/image-index/${encodeURIComponent(imageId)}`;
}
