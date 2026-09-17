import { NextResponse } from "next/server";
import { analyzeSpreadsheetProject } from "@/lib/spreadsheet-production";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await analyzeSpreadsheetProject((await params).id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "商品 AI 分析失败" }, { status: 400 });
  }
}

