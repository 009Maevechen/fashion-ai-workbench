import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import {
  imageSha256,
  normalizeFace,
  normalizeProductType,
  normalizeShot,
  readVisualReferenceManifest,
  resolveVisualReferenceImage,
  scanVisualReferenceLibrary,
  writeVisualReferenceManifest,
  type VisualReferenceImage,
  type VisualReferenceManifest,
  type VisualReferencePoseGroup,
} from "@/lib/visual-reference";
import { recognizeVisualReferenceImage } from "@/lib/ai/visual-reference-analysis";
import { runtimeVisualReferenceDir, saveVisualReferenceSettings, visualReferenceSettings } from "@/lib/runtime-paths";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const manifest = await readVisualReferenceManifest();
    return NextResponse.json({
      ...manifest,
      libraryDir: runtimeVisualReferenceDir(),
      settings: visualReferenceSettings(),
      stats: {
        images: manifest.images.length,
        needsReview: manifest.images.filter((image) => image.needsReview).length,
        poseGroups: manifest.poseGroups.length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取视觉参考库失败" }, { status: 400 });
  }
}

/** 扫描图库：读取本地图片，为未识别的图片调用视觉模型识别，重建索引。 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string; enabled?: boolean; modelId?: string };
    if (body.action === "set-settings") {
      await saveVisualReferenceSettings({ enabled: body.enabled, modelId: body.modelId });
      return NextResponse.json({ ok: true, settings: visualReferenceSettings() });
    }
    if (body.action === "scan" || body.action === "rescan" || body.action === "rebuild") {
      const { images, groups } = await scanVisualReferenceLibrary();
      const existing = await readVisualReferenceManifest();
      const existingByPath = new Map(existing.images.map((image) => [image.relativePath, image]));
      const now = new Date().toISOString();

      // 识别散图与姿势组图片（跳过已识别且未强制重扫的）
      const force = body.action === "rebuild";
      const recognizedImages: VisualReferenceImage[] = [];
      const root = runtimeVisualReferenceDir();
      for (const item of images) {
        const cached = existingByPath.get(item.relativePath);
        if (!force && cached && cached.recognizedAt) {
          recognizedImages.push(cached);
          continue;
        }
        const fullPath = await resolveVisualReferenceImage(item.relativePath);
        let buffer: Buffer;
        try {
          buffer = await fs.readFile(fullPath);
        } catch {
          continue;
        }
        const hash = imageSha256(buffer);
        let recognition: VisualReferenceImage;
        try {
          const result = await recognizeVisualReferenceImage(fullPath, visualReferenceSettings().modelId);
          recognition = {
            id: cached?.id || crypto.randomUUID(),
            relativePath: item.relativePath,
            fileName: item.fileName,
            productType: normalizeProductType(result.productType) || result.productType,
            productSubtype: result.productSubtype,
            poseType: result.poseType,
            shotType: normalizeShot(result.shotType) || result.shotType,
            faceVisible: normalizeFace(result.faceVisible === undefined ? undefined : String(result.faceVisible)) ?? result.faceVisible,
            displayFocus: result.displayFocus,
            composition: result.composition,
            styleTags: result.styleTags,
            suitableProductTypes: result.suitableProductTypes,
            source: "visual-reference",
            imageHash: hash,
            needsReview: result.needsReview,
            recognizedAt: now,
          };
        } catch (error) {
          // 识别失败不阻断扫描，标记待确认
          recognition = {
            id: cached?.id || crypto.randomUUID(),
            relativePath: item.relativePath,
            fileName: item.fileName,
            imageHash: hash,
            needsReview: true,
            recognizedAt: now,
          };
          void error;
        }
        recognizedImages.push(recognition);
      }

      // 构建姿势组索引
      const poseGroups: VisualReferencePoseGroup[] = groups.map((group) => {
        const prev = existing.poseGroups.find((g) => g.folderRelativePath === group.folderRelativePath);
        const coverImage = recognizedImages.find((image) => image.relativePath === group.cover);
        return {
          id: prev?.id || crypto.randomUUID(),
          poseGroupId: prev?.poseGroupId || group.folderName,
          folderName: group.folderName,
          folderRelativePath: group.folderRelativePath,
          coverPath: group.cover,
          pose01Path: group.pose01,
          pose02Path: group.pose02,
          pose03Path: group.pose03,
          productType: prev?.productType || coverImage?.productType,
          productSubtype: prev?.productSubtype || coverImage?.productSubtype,
          shotType: prev?.shotType || coverImage?.shotType,
          faceVisible: prev?.faceVisible ?? coverImage?.faceVisible,
          displayFocus: prev?.displayFocus || coverImage?.displayFocus,
          tags: prev?.tags || (coverImage?.styleTags || []).join(","),
          source: prev?.source,
          missingImages: group.missing,
          needsReview: coverImage?.needsReview,
          updatedAt: now,
        };
      });

      const manifest: VisualReferenceManifest = {
        schemaVersion: 1,
        libraryDir: root,
        updatedAt: now,
        images: recognizedImages,
        poseGroups,
      };
      await writeVisualReferenceManifest(manifest);
      return NextResponse.json({
        ...manifest,
        stats: { images: recognizedImages.length, needsReview: recognizedImages.filter((image) => image.needsReview).length, poseGroups: poseGroups.length },
      });
    }
    throw new Error("不支持的操作");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "视觉参考操作失败" }, { status: 400 });
  }
}
