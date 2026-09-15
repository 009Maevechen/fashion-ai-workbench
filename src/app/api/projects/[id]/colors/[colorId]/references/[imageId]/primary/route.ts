import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/db";

// 把某张参考图设为主参考图，其余自动降为补充图。
export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string; colorId: string; imageId: string }> },
) {
  try {
    const { id, colorId, imageId } = await params;
    const project = await getProject(id);
    if (!project) throw new Error("项目不存在");
    const colors = [...(project.targetColors || [])];
    const index = colors.findIndex((c) => c.id === colorId);
    if (index < 0) throw new Error("颜色款不存在");
    const color = colors[index];
    if (!(color.referenceImages || []).some((img) => img.id === imageId))
      throw new Error("参考图不存在");
    const referenceImages = (color.referenceImages || []).map((img) => ({
      ...img,
      isPrimary: img.id === imageId,
      role: img.id === imageId ? ("primary" as const) : ("supporting" as const),
    }));
    colors[index] = {
      ...color,
      referenceImages,
      primaryReferenceId: imageId,
      colorProfile: undefined,
      colorMap: undefined,
      designOverrides: undefined,
      variantConfidence: undefined,
      referenceNeedsReview: undefined,
      referenceAnalysisSignature: undefined,
    };
    const updated = await updateProject(id, { targetColors: colors });
    return NextResponse.json({ color: (updated.targetColors || []).find((c) => c.id === colorId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "设置主参考图失败" },
      { status: 400 },
    );
  }
}
