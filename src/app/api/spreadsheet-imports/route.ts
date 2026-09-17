import { NextResponse } from "next/server";
import { importSkuSpreadsheet } from "@/lib/spreadsheet-production";
import { listSpreadsheetImports } from "@/lib/spreadsheet-import-store";
import { validateSpreadsheetUploadSize } from "@/lib/table-parse";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listSpreadsheetImports());
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择 WPS/Excel 商品表格");
    validateSpreadsheetUploadSize(file.size);
    const baseDirectory = String(form.get("baseDirectory") || "").trim() || undefined;
    const result = await importSkuSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name, baseDirectory);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "商品表格导入失败" }, { status: 400 });
  }
}
