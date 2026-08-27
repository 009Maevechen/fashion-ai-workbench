import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveLocalImage } from "@/lib/pose-inventory";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const relative = url.searchParams.get("path");
    if (!relative) throw new Error("缺少图片路径");
    const target = resolveLocalImage(relative);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(target);
    } catch {
      return NextResponse.json({ error: "图片文件不存在" }, { status: 404 });
    }
    const ext = path.extname(target).toLowerCase();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME[ext] || "image/jpeg",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取图片失败" }, { status: 400 });
  }
}
