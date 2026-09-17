import { NextResponse } from "next/server";
import { listIndexedImages } from "@/lib/image-index";

export async function GET(request: Request) {
  const sku = new URL(request.url).searchParams.get("sku") || undefined;
  return NextResponse.json(await listIndexedImages(sku));
}

