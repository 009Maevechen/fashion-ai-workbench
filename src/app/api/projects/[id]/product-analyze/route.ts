import { NextResponse } from "next/server";
import { getProject, updateProjectWith } from "@/lib/db";
import { analyzeProductImage } from "@/lib/ai/product-analysis";
import { mergeGarmentClassification, legacyProductType } from "@/lib/garment-classification";
import { listInventory, recommendGroups } from "@/lib/pose-inventory";
import { mergeProductProfileAnalysis } from "@/lib/product-profile-analysis";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const project = await getProject((await params).id);
    if (!project) throw new Error("商品项目不存在");
    if (!project.assets.garmentImage) throw new Error("请先上传一张产品主图");
    const body = await request.json().catch(() => ({})) as { force?: boolean };
    const sourceImage = project.assets.garmentEnhancedImage || project.assets.garmentImage;
    const analysis = await analyzeProductImage(sourceImage, { force: Boolean(body.force) });
    let poseGroups: Awaited<ReturnType<typeof listInventory>>["groups"] | undefined;
    try {
      poseGroups = (await listInventory()).groups;
    } catch { /* 姿势库不可用不影响产品视觉识别；姿势页仍可单独重试推荐。 */ }
    const updated = await updateProjectWith(project.id, (current) => {
      if ((current.assets.garmentEnhancedImage || current.assets.garmentImage) !== sourceImage)
        throw new Error("产品图已在识别期间更换，请重新识别新图片");
      const garmentProfile = mergeGarmentClassification(current.garmentProfile, analysis.garmentClassification, sourceImage);
      const recommendedPoses = poseGroups && garmentProfile.primaryCategory
        ? recommendGroups(poseGroups, {
            productType: legacyProductType(garmentProfile.primaryCategory, garmentProfile.secondaryCategory),
            productSubtype: garmentProfile.secondaryCategory,
          }).filter((item) => item.score > 0).slice(0, 3).map((item) => ({
            groupId: item.group.poseGroupId, poseGroupId: item.group.poseGroupId,
            score: item.score, reasons: item.reasons,
          }))
        : undefined;
      return {
        garmentProfile,
        profile: mergeProductProfileAnalysis(current.profile, analysis),
        productionTask: current.productionTask && recommendedPoses
          ? { ...current.productionTask, recommendedPoses }
          : current.productionTask,
        productType: !garmentProfile.primaryCategory || garmentProfile.classificationConfirmed || garmentProfile.source === "spreadsheet"
          ? current.productType
          : legacyProductType(garmentProfile.primaryCategory, garmentProfile.secondaryCategory),
      };
    });
    return NextResponse.json({ ...analysis, garmentProfile: updated.garmentProfile, profile: updated.profile, productType: updated.productType });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "产品图片识别失败" },
      { status: 400 },
    );
  }
}
