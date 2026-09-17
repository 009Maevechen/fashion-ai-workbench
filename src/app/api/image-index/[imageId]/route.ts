import { NextResponse } from "next/server";
import { readIndexedImage } from "@/lib/image-index";

export async function GET(_: Request, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { entry, buffer } = await readIndexedImage((await params).imageId);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": entry.mime || "image/jpeg",
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "图片读取失败" }, { status: 404 });
  }
}

