import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type ManifestImage = {
  imageId: string;
  filename: string;
  relativePath: string;
  sku?: string;
  productName?: string;
  productType?: string;
  color?: string;
  poseIndex?: number;
  poseLabels?: string[];
  imageType: "final" | "pose";
  createdAt: string;
  imageHash: string;
  perceptualHash?: string;
  shotType?: string;
  faceMode?: string;
  displayFocus?: string[];
};

export type Manifest = {
  schemaVersion: 1;
  updatedAt: string;
  images: ManifestImage[];
};

const MANIFEST_NAME = "manifest.json";

export function emptyManifest(): Manifest {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), images: [] };
}

export async function readManifest(dir: string): Promise<Manifest> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(dir, MANIFEST_NAME), "utf8")) as Partial<Manifest>;
    return {
      schemaVersion: 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      images: Array.isArray(parsed.images) ? parsed.images : [],
    };
  } catch {
    return emptyManifest();
  }
}

export async function writeManifest(dir: string, manifest: Manifest): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const temporary = path.join(dir, `${MANIFEST_NAME}.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temporary, JSON.stringify({ ...manifest, updatedAt: new Date().toISOString() }, null, 2));
  await fs.rename(temporary, path.join(dir, MANIFEST_NAME));
}

export async function upsertManifestImage(dir: string, image: ManifestImage): Promise<Manifest> {
  const manifest = await readManifest(dir);
  const existing = manifest.images.find((item) => item.relativePath === image.relativePath);
  if (existing) Object.assign(existing, image);
  else manifest.images.push(image);
  await writeManifest(dir, manifest);
  return manifest;
}

export function imageSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
