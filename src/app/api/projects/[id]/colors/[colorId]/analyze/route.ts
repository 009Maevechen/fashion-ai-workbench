import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/db";
import {
  analyzeColorVariantReferences,
  buildColorMap,
  colorVariantAnalysisSignature,
  referenceNeedsReview,
} from "@/lib/color-variant";
import { activeIndependentReference } from "@/lib/recolor-reference-source";

// 只分析当前生效的独立主参考图；历史图不得混入当前色款。
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
    const activeReference = activeIndependentReference(color);
    if (!activeReference) throw new Error("请先为该颜色款上传参考图");
    const referenceImages = [activeReference];
    const signature = colorVariantAnalysisSignature(referenceImages);
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
    const observedProfile =
      await analyzeColorVariantReferences(referenceImages);
    const colorProfile = observedProfile;
    const colorMap = buildColorMap(observedProfile);
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
      hex: colorProfile.primaryHex || color.hex,
      baseHex: colorProfile.primaryHex || color.baseHex,
      userConfirmedHex: undefined,
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
