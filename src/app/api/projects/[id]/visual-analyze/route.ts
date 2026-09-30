import { NextResponse } from "next/server";
import { getProject, updateProjectWith, type ProductVisualRegion } from "@/lib/db";
import { detectProductVisualRegions, buildVisualRegion } from "@/lib/ai/product-visual-regions";
import { applyExplicitAbsenceRules } from "@/lib/ai/product-visual-regions-normalize";
import { PRODUCT_VISUAL_ANALYSIS_VERSION } from "@/lib/product-visual-version";
import { ZodError } from "zod";

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
    const detected = applyExplicitAbsenceRules(
      await detectProductVisualRegions(source),
      project.profile?.attributes,
    );
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
    // 重跑时先清理尚未人工确认的旧 AI 裁图。若新版审核拒绝了“伪背面”或
    // 无价值局部，旧错误图片不能继续留在对应卡片中；人工上传/确认内容不动。
    for (const assetKey of AUTO_ASSET_KEYS) {
      const evidence = assetEvidence[assetKey];
      if (evidence?.source === "ai_crop" && !evidence.confirmed) {
        delete assets[assetKey];
        delete assetEvidence[assetKey];
      }
    }
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
        version: PRODUCT_VISUAL_ANALYSIS_VERSION,
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
    const message = error instanceof ZodError
      ? "AI返回的细节位置格式不完整，请重新识别；系统没有保存这次不可靠的结果。"
      : error instanceof Error ? error.message : "产品细节识别失败";
    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}
