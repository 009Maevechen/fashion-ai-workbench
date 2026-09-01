import { NextResponse } from "next/server";
import sharp from "sharp";
import { getProject, updateProject } from "@/lib/db";
import { localImage, saveOutput } from "@/lib/ai/storage";

type Region = { x: number; y: number; width: number; height: number };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const { region } = (await request.json()) as { region: Region };
    const project = await getProject(id);
    if (!project?.assets.garmentImage) throw new Error("请先上传服装产品图");
    if (!region || region.width < 0.01 || region.height < 0.01) throw new Error("请框选完整的整套服装区域");
    const input = await localImage(project.assets.garmentImage);
    const normalized = await sharp(input).rotate().toBuffer();
    const metadata = await sharp(normalized).metadata();
    if (!metadata.width || !metadata.height) throw new Error("服装产品图尺寸无效");
    const left = Math.max(0, Math.min(metadata.width - 1, Math.round(region.x * metadata.width)));
    const top = Math.max(0, Math.min(metadata.height - 1, Math.round(region.y * metadata.height)));
    const width = Math.min(metadata.width - left, Math.max(10, Math.round(region.width * metadata.width)));
    const height = Math.min(metadata.height - top, Math.max(10, Math.round(region.height * metadata.height)));
    const output = await sharp(normalized).extract({ left, top, width, height }).jpeg({ quality: 96, mozjpeg: true }).toBuffer();
    const url = await saveOutput(project.sku, "source", `garment-crop-${crypto.randomUUID()}.jpg`, output);
    await updateProject(id, { assets: { ...project.assets, garmentCropImage: url, garmentCropRegion: region } });
    return NextResponse.json({ url, region });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存服装框选区域失败" }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const project = await getProject(id);
    if (!project) throw new Error("商品项目不存在");
    const assets = { ...project.assets };
    delete assets.garmentCropImage;
    delete assets.garmentCropRegion;
    await updateProject(id, { assets });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "清除服装框选区域失败" }, { status: 400 });
  }
}
