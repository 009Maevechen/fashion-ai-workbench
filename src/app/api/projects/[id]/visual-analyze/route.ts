import { NextResponse } from "next/server";
import { getProject, updateProjectWith, type ProductVisualRegion } from "@/lib/db";
import { detectProductVisualRegions, buildVisualRegion } from "@/lib/ai/product-visual-regions";

const AUTO_ASSET_KEYS = [
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
] as const;

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = (await params).id;
    const project = await getProject(id);
    if (!project) throw new Error("商品项目不存在");
    const source = project.assets.garmentEnhancedImage || project.assets.garmentImage;
    if (!source) throw new Error("请先上传一张产品主图");
    const detected = await detectProductVisualRegions(source);
    if (!detected.regions.length)
      throw new Error("未在产品主图中识别出可裁剪的细节区域");
    const regions: ProductVisualRegion[] = [];
    for (const region of detected.regions) {
      const regionAssetKey = (
        {
          frontView: "productFrontImage",
          backView: "productBackImage",
          detail: "productDetailImage",
          print: "printCloseupImage",
          buttons: "buttonCloseupImage",
          pockets: "pocketCloseupImage",
          neckline: "necklineCloseupImage",
          sleeve: "sleeveCloseupImage",
          hem: "hemCloseupImage",
          stitching: "stitchingCloseupImage",
          fabric: "fabricTextureImage",
          multiColor: "colorReferenceImage",
          modelReference: "modelReferenceImage",
        } as const
      )[region.type];
      if (!regionAssetKey || !(AUTO_ASSET_KEYS as readonly string[]).includes(regionAssetKey))
        continue;
      const existingEvidence = project.assetEvidence?.[regionAssetKey];
      const preserveHumanWork = Boolean(project.assets[regionAssetKey])
        && (existingEvidence?.source !== "ai_crop" || existingEvidence.confirmed);
      if (preserveHumanWork) continue;
      regions.push(await buildVisualRegion(project.sku, source, region));
    }
    const assets = { ...project.assets };
    const assetEvidence = { ...(project.assetEvidence || {}) };
    const now = new Date().toISOString();
    for (const region of regions) {
      const assetKey = region.assetKey;
      if (!(AUTO_ASSET_KEYS as readonly string[]).includes(assetKey as (typeof AUTO_ASSET_KEYS)[number]))
        continue;
      assets[assetKey] = region.upscalePath;
      assetEvidence[assetKey] = {
        source: "ai_crop",
        sourceImage: source,
        confidence: region.confidence,
        boundingBox: region.boundingBox,
        needsReview: true,
        confirmed: false,
        reason: `${region.reason}；AI建议裁图，等待用户人工确认`,
        regionId: region.id,
        createdAt: now,
      };
    }
    const updated = await updateProjectWith(id, () => ({
      assets,
      assetEvidence,
      productVisualAnalysis: {
        status: "completed",
        sourceImage: source,
        model: undefined,
        analyzedAt: now,
        regions,
        missing: detected.missing,
      },
      garmentDetailLock: undefined,
    }));
    return NextResponse.json({
      project: updated,
      regions,
      missing: detected.missing,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "产品细节识别失败" },
      { status: 400 },
    );
  }
}
