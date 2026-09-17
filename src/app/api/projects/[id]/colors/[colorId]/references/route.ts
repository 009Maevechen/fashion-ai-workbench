import { NextResponse } from "next/server";
import { getProject, updateProject, type ColorReferenceImage } from "@/lib/db";
import { saveColorReferenceImage } from "@/lib/color-variant";
import { moveFileToTrash } from "@/lib/ai/storage";

// 给某个颜色款上传新的唯一生效参考图；旧图保留为历史，但不参与分析或生成。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; colorId: string }> },
) {
  try {
    const { id, colorId } = await params;
    const form = await request.formData();
    const file = form.get("file");
    const replaceImageId = (String(form.get("replaceImageId") || "") || undefined) as string | undefined;
    if (!(file instanceof File)) throw new Error("缺少参考图片");
    const project = await getProject(id);
    if (!project) throw new Error("项目不存在");
    const colors = [...(project.targetColors || [])];
    const index = colors.findIndex((c) => c.id === colorId);
    if (index < 0) throw new Error("颜色款不存在");
    const color = colors[index];
    const image = await saveColorReferenceImage(project.sku, colorId, file);
    let referenceImages = [...(color.referenceImages || [])];
    const removed: ColorReferenceImage[] = [];
    if (replaceImageId) {
      const target = referenceImages.find((img) => img.id === replaceImageId);
      if (target) {
        removed.push(target);
        referenceImages = referenceImages.filter((img) => img.id !== replaceImageId);
      }
    }
    referenceImages = referenceImages.map((img) => ({
      ...img,
      isPrimary: false,
      role: "supporting" as const,
    }));
    image.isPrimary = true;
    image.role = "primary";
    referenceImages.push(image);
    colors[index] = {
      ...color,
      referenceImages,
      primaryReferenceId: image.id,
      colorProfile: undefined,
      colorMap: undefined,
      designOverrides: undefined,
      variantConfidence: undefined,
      referenceNeedsReview: undefined,
      referenceAnalysisSignature: undefined,
      userConfirmedHex: undefined,
    };
    const updated = await updateProject(id, { targetColors: colors });
    for (const r of removed) {
      await moveFileToTrash(r.path, id);
      if (r.previewPath) await moveFileToTrash(r.previewPath, id);
      if (r.thumbnailPath) await moveFileToTrash(r.thumbnailPath, id);
    }
    return NextResponse.json({
      image,
      color: (updated.targetColors || []).find((c) => c.id === colorId),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传参考图失败" },
      { status: 400 },
    );
  }
}
