import { NextResponse } from "next/server";
import { getProject } from "@/lib/db";
import { analyzeProductImage } from "@/lib/ai/product-analysis";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const project = await getProject((await params).id);
    if (!project) throw new Error("商品项目不存在");
    if (!project.assets.garmentImage) throw new Error("请先上传一张产品主图");
    return NextResponse.json(
      await analyzeProductImage(project.assets.garmentImage),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "产品图片识别失败" },
      { status: 400 },
    );
  }
}
