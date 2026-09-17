import { NextResponse } from "next/server";
import { getSpreadsheetImport } from "@/lib/spreadsheet-import-store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const record = await getSpreadsheetImport((await params).id);
  return record ? NextResponse.json(record) : NextResponse.json({ error: "导入记录不存在" }, { status: 404 });
}

