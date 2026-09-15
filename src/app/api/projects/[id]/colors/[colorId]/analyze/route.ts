import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/db";
import {
  analyzeColorVariantReferences,
  buildColorMap,
  colorVariantAnalysisSignature,
  referenceNeedsReview,
} from "@/lib/color-variant";
import { selectedRecolorMainColor } from "@/lib/color-sets";

// 分析单个颜色款的全部参考图：综合识别配色、生成 colorMap、检测冲突（needsReview）。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; colorId: string }> },
) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
    };
    const { id, colorId } = await params;
    const project = await getProject(id);
    if (!project) throw new Error("项目不存在");
    const colors = [...(project.targetColors || [])];
    const index = colors.findIndex((c) => c.id === colorId);
    if (index < 0) throw new Error("颜色款不存在");
    const color = colors[index];
    const referenceImages = color.referenceImages || [];
    if (!referenceImages.length) throw new Error("请先为该颜色款上传参考图");
    const baseStyle =
      project.confirmedPoseImages?.[0] ||
      project.confirmedTryonImage ||
      project.assets.garmentCropImage ||
      project.assets.garmentImage;
    const selectedMainColor = selectedRecolorMainColor(color);
    const signature = colorVariantAnalysisSignature(
      referenceImages,
      selectedMainColor,
    );
    if (
      !body.force &&
      color.referenceAnalysisSignature === signature &&
      color.colorProfile
    ) {
      return NextResponse.json({
        color,
        colorProfile: color.colorProfile,
        colorMap: color.colorMap,
        needsReview: color.referenceNeedsReview,
        cached: true,
      });
    }
    const observedProfile = await analyzeColorVariantReferences(
      referenceImages,
      baseStyle,
    );
    // 保留照片的观察值用于识别哪些局部与照片主体同色；真正生成时由 colorMap
    // 将主体及同色罗纹统一映射到用户基本色，其他明确局部配色继续取参考图。
    const colorProfile = observedProfile;
    const colorMap = buildColorMap(observedProfile, selectedMainColor);
    const needsReview = referenceNeedsReview(colorProfile);
    colors[index] = {
      ...color,
      colorProfile,
      colorMap,
      referenceNeedsReview: needsReview,
      variantConfidence: colorProfile.confidence,
      designOverrides: colorProfile.designDifferences?.length
        ? colorProfile.designDifferences
        : color.designOverrides,
      referenceAnalysisSignature: signature,
      // 主色识别成功即补全 hex，方便用户直接核对。
      hex: color.hex || colorProfile.primaryHex,
      name: color.name || colorProfile.primaryColor || "",
    };
    const updated = await updateProject(id, { targetColors: colors });
    return NextResponse.json({
      color: (updated.targetColors || []).find((c) => c.id === colorId),
      colorProfile,
      colorMap,
      needsReview,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "颜色款分析失败" },
      { status: 400 },
    );
  }
}
