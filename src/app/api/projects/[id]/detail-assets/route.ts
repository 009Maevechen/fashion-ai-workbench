import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProject,
  updateProjectWith,
  type ProductDetailAssetKey,
} from "@/lib/db";
import { cropAndUpscaleRegion } from "@/lib/ai/product-visual-regions";
import { moveFileToTrash } from "@/lib/ai/storage";
import { invalidateForAssetChange } from "@/lib/workflow";

const DETAIL_CROP_KEYS = [
  "productFrontImage",
  "productBackImage",
  "productDetailImage",
  "printCloseupImage",
  "buttonCloseupImage",
  "pocketCloseupImage",
  "necklineCloseupImage",
  "sleeveCloseupImage",
  "hemCloseupImage",
  "stitchingCloseupImage",
  "fabricTextureImage",
  "colorReferenceImage",
] as const satisfies readonly ProductDetailAssetKey[];

const assetKeySchema = z.enum(DETAIL_CROP_KEYS);
const cropSchema = z.object({
  assetKey: assetKeySchema,
  boundingBox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.01).max(1),
    height: z.number().min(0.01).max(1),
  }),
});
const confirmSchema = z.object({ assetKey: assetKeySchema });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const input = cropSchema.parse(await request.json());
    const project = await getProject(id);
    if (!project) throw new Error("商品项目不存在");
    const source = project.assets.garmentImage;
    if (!source) throw new Error("请先上传并保存产品主图");
    const previous = project.assets[input.assetKey];
    const cropped = await cropAndUpscaleRegion(project.sku, source, input.boundingBox);
    const now = new Date().toISOString();
    const updated = await updateProjectWith(id, (current) => ({
      assets: { ...current.assets, [input.assetKey]: cropped.upscalePath },
      assetEvidence: {
        ...(current.assetEvidence || {}),
        [input.assetKey]: {
          source: "manual_crop",
          sourceImage: source,
          confidence: 1,
          boundingBox: input.boundingBox,
          needsReview: false,
          confirmed: true,
          reason: "用户从产品主图手动框选并确认",
          createdAt: now,
          reviewedAt: now,
        },
      },
      garmentDetailLock: undefined,
    }));
    await invalidateForAssetChange(id, input.assetKey);
    if (previous && previous !== cropped.upscalePath) await moveFileToTrash(previous, id);
    return NextResponse.json({ project: updated, url: cropped.upscalePath, evidence: updated.assetEvidence?.[input.assetKey] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存人工细节裁图失败" }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const { assetKey } = confirmSchema.parse(await request.json());
    const project = await getProject(id);
    if (!project) throw new Error("商品项目不存在");
    if (!project.assets[assetKey]) throw new Error("该补充素材还没有可确认的图片");
    const currentEvidence = project.assetEvidence?.[assetKey];
    if (!currentEvidence) throw new Error("该补充素材没有可确认的来源信息，请重新上传或从主图框选");
    const now = new Date().toISOString();
    const updated = await updateProjectWith(id, (current) => ({
      assetEvidence: {
        ...(current.assetEvidence || {}),
        [assetKey]: {
          ...currentEvidence,
          needsReview: false,
          confirmed: true,
          reason: currentEvidence.source === "ai_crop" ? "AI建议裁图已经用户人工确认" : currentEvidence.reason,
          reviewedAt: now,
        },
      },
      garmentDetailLock: undefined,
    }));
    await invalidateForAssetChange(id, assetKey);
    return NextResponse.json({ project: updated, evidence: updated.assetEvidence?.[assetKey] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "确认补充素材失败" }, { status: 400 });
  }
}
