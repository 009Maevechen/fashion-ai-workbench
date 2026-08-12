import { NextResponse } from "next/server";
import { getProject } from "@/lib/db";
import { analyzeGarmentColors } from "@/lib/ai/color-analysis";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const project = await getProject((await params).id);
    if (!project) throw new Error("商品项目不存在");
    const reference =
      project.assets.colorReferenceCropImage ||
      project.assets.colorReferenceImage;
    if (!reference) throw new Error("请先上传颜色参考图");
    const colors = await analyzeGarmentColors(reference);
    if (!colors.length)
      throw new Error("没有从参考图中识别到有效颜色，请更换清晰的产品平铺图");
    return NextResponse.json({ colors, analyzedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "颜色分析失败" },
      { status: 400 },
    );
  }
}
