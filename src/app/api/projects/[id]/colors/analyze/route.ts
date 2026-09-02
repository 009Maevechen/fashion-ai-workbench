import { NextResponse } from "next/server";
import { getProject } from "@/lib/db";
import { analyzeGarmentColors } from "@/lib/ai/color-analysis";
import { localImage, saveOutput } from "@/lib/ai/storage";
import { safeSegment } from "@/lib/ai/validators";
import { colorDistance } from "@/lib/color-palette";
import { rotatedDimensions, rotateAndExtract } from "@/lib/image-limits";

type Region = { x: number; y: number; width: number; height: number };

function validVariantRegion(region?: Region) {
  return Boolean(region && region.width >= 0.08 && region.height >= 0.08 && region.width * region.height >= 0.015);
}

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const project = await getProject((await params).id);
    if (!project) throw new Error("商品项目不存在");
    const reference =
      project.assets.colorReferenceCropImage ||
      project.assets.colorReferenceImage ||
      project.assets.garmentImage;
    if (!reference) throw new Error("请先上传颜色参考图或产品主图");
    const result = await analyzeGarmentColors(reference);
    if (!result.colors.length)
      throw new Error("没有从参考图中识别到有效颜色，请更换清晰的产品平铺图");
    const source = await localImage(reference);
    const metadata = await rotatedDimensions(source);
    const baseRegion = reference === project.assets.colorReferenceCropImage ? project.assets.colorReferenceCropRegion : undefined;
    const colors = await Promise.all(result.colors.map(async (color, index) => {
      const manualReference = (project.targetColors || []).find(existing => existing.cropImage && existing.hex && colorDistance(existing.hex, color.hex) < 12);
      if (manualReference?.cropImage) return { ...color, cropImage: manualReference.cropImage, cropRegion: manualReference.cropRegion };
      const region = color.boundingBox;
      if (!validVariantRegion(region)) return color;
      const padding = 0.012;
      const x = Math.max(0, region!.x - padding);
      const y = Math.max(0, region!.y - padding);
      const right = Math.min(1, region!.x + region!.width + padding);
      const bottom = Math.min(1, region!.y + region!.height + padding);
      const cropRegion = { x, y, width: right - x, height: bottom - y };
      const left = Math.max(0, Math.floor(cropRegion.x * metadata.width));
      const top = Math.max(0, Math.floor(cropRegion.y * metadata.height));
      const width = Math.min(metadata.width - left, Math.max(10, Math.ceil(cropRegion.width * metadata.width)));
      const height = Math.min(metadata.height - top, Math.max(10, Math.ceil(cropRegion.height * metadata.height)));
      const buffer = await rotateAndExtract(source, { left, top, width, height }, 95);
      const cropImage = await saveOutput(project.sku, "source/colors", `${safeSegment(color.name || `variant-${index + 1}`)}-design-${crypto.randomUUID()}.jpg`, buffer);
      const sourceRegion = baseRegion ? {
        x: baseRegion.x + cropRegion.x * baseRegion.width,
        y: baseRegion.y + cropRegion.y * baseRegion.height,
        width: cropRegion.width * baseRegion.width,
        height: cropRegion.height * baseRegion.height,
      } : cropRegion;
      return { ...color, cropImage, cropRegion: sourceRegion };
    }));
    const missingDesignReferences = colors.filter(color => !("cropImage" in color && color.cropImage)).length;
    return NextResponse.json({
      ...result,
      colors,
      needsReview: result.needsReview || missingDesignReferences > 0,
      reviewReason: missingDesignReferences > 0 ? `${missingDesignReferences} 个颜色款未可靠定位，请手动框选整件服装` : result.reviewReason,
      analyzedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "颜色分析失败" },
      { status: 400 },
    );
  }
}
