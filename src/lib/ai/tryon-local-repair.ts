import "server-only";
import sharp from "sharp";
import type { ProviderRuntimeConfig } from "./provider-settings-types";
import type { TryOnRepairTarget } from "../tryon-edit-pipeline";
import { localImage, toDataUrl } from "./storage";

export type TryOnEditCapability = "masked_edit" | "image_edit" | "tryon_only";

export function tryOnEditCapability(
  runtime: ProviderRuntimeConfig,
): TryOnEditCapability {
  if (runtime.type === "syc-openai-compatible") return "masked_edit";
  if (runtime.type === "openai-compatible")
    return /\/images\/edits\/?$/i.test(runtime.baseUrl)
      ? "masked_edit"
      : "image_edit";
  if (["volcengine", "custom"].includes(runtime.type)) return "image_edit";
  return "tryon_only";
}

export async function createTryOnLocalRepairMask(
  sourceUrl: string,
  targets: TryOnRepairTarget[],
) {
  const source = await localImage(sourceUrl);
  const metadata = await sharp(source).metadata();
  const width = metadata.width,
    height = metadata.height;
  if (!width || !height) throw new Error("无法读取待修复图片尺寸");
  const overlays = targets.flatMap((target) => {
    const box = target.boundingBox;
    if (!box) return [];
    const padding = 0.012;
    const left = Math.max(0, Math.floor((box.x - padding) * width));
    const top = Math.max(0, Math.floor((box.y - padding) * height));
    const right = Math.min(
      width,
      Math.ceil((box.x + box.width + padding) * width),
    );
    const bottom = Math.min(
      height,
      Math.ceil((box.y + box.height + padding) * height),
    );
    if (right <= left || bottom <= top) return [];
    const rectangle = Buffer.from(
      `<svg width="${right - left}" height="${bottom - top}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="4" fill="white"/></svg>`,
    );
    return [{ input: rectangle, left, top, blend: "dest-out" as const }];
  });
  if (!overlays.length) throw new Error("一致性检查没有返回可靠的局部坐标");
  const mask = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();
  return toDataUrl(mask, "image/png");
}
