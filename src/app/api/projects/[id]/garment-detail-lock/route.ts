import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/db";
import { analyzeGarmentDetailLock } from "@/lib/ai/garment-detail-lock";
import { localImage } from "@/lib/ai/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const project = await getProject((await params).id);
  if (!project) return NextResponse.json({ error: "商品项目不存在" }, { status: 404 });
  return NextResponse.json({ lock: project.garmentDetailLock || null });
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const project = await getProject(id);
    if (!project) throw new Error("商品项目不存在");
    let source = project.assets.garmentCropImage || project.assets.garmentImage;
    if (!source) throw new Error("请先上传并保存服装产品图");
    try {
      await localImage(source);
    } catch (error) {
      if (!project.assets.garmentImage || project.assets.garmentImage === source) throw error;
      await localImage(project.assets.garmentImage);
      source = project.assets.garmentImage;
    }
    const lock = await analyzeGarmentDetailLock(project, source);
    await updateProject(id, { garmentDetailLock: lock });
    return NextResponse.json({ lock });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "服装细节锁定失败" }, { status: 400 });
  }
}
