import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/db";
import { moveFileToTrash } from "@/lib/ai/storage";

// 删除某个颜色款的一张参考图；若删除的是主参考图，则自动顺延下一张为主参考图。
export async function DELETE(
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
    const referenceImages = [...(color.referenceImages || [])];
    const removed = referenceImages.find((img) => img.id === imageId);
    if (!removed) throw new Error("参考图不存在");
    const next = referenceImages.filter((img) => img.id !== imageId);
    if (removed.isPrimary && next.length) {
      next[0] = { ...next[0], isPrimary: true, role: "primary" as const };
    }
    colors[index] = {
      ...color,
      referenceImages: next,
      primaryReferenceId: next.find((img) => img.isPrimary)?.id,
      colorProfile: undefined,
      colorMap: undefined,
      designOverrides: undefined,
      variantConfidence: undefined,
      referenceNeedsReview: undefined,
      referenceAnalysisSignature: undefined,
    };
    const updated = await updateProject(id, { targetColors: colors });
    await moveFileToTrash(removed.path, id);
    if (removed.previewPath) await moveFileToTrash(removed.previewPath, id);
    if (removed.thumbnailPath) await moveFileToTrash(removed.thumbnailPath, id);
    return NextResponse.json({ color: (updated.targetColors || []).find((c) => c.id === colorId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除参考图失败" },
      { status: 400 },
    );
  }
}
