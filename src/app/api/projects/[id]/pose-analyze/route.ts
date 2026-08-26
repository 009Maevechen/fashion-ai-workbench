import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject } from "@/lib/db";
import { analyzePoseReferences } from "@/lib/ai/pose-reference-analysis";
const schema = z.object({
  poseReferenceImages: z.array(z.string().startsWith("/api/files/")).length(3),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const project = await getProject((await params).id);
    if (!project) throw new Error("商品项目不存在");
    const { poseReferenceImages } = schema.parse(await request.json()),
      saved = project.assets.poseReferenceImages || [];
    if (poseReferenceImages.some((image) => !saved.includes(image)))
      throw new Error("姿势参考图必须先保存到当前项目");
    return NextResponse.json({
      analyses: await analyzePoseReferences(poseReferenceImages),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "姿势参考图识别失败" },
      { status: 400 },
    );
  }
}
