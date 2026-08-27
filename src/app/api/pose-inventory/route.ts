import { NextResponse } from "next/server";
import {
  importFromTable,
  listInventory,
  recommendGroups,
  rescanLibrary,
} from "@/lib/pose-inventory";
import { parseTable } from "@/lib/table-parse";
import { getProject } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("action") === "scan") {
      return NextResponse.json(await rescanLibrary());
    }
    const manifest = await listInventory();
    const recommendProjectId = url.searchParams.get("recommendFor");
    if (recommendProjectId) {
      const project = await getProject(recommendProjectId);
      if (project) {
        const recommended = recommendGroups(manifest.groups, {
          productType: project.productType,
          productSubtype: project.profile?.attributes?.fit,
          shotType: undefined,
          faceVisible: project.settings.pose?.face,
        });
        return NextResponse.json({ ...manifest, recommendations: recommended.slice(0, 5) });
      }
    }
    return NextResponse.json(manifest);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取姿势库存失败" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择 CSV 或 Excel 文件");
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = await parseTable(buffer, file.name);
    if (!rows.length) throw new Error("表格中没有有效数据行");
    const result = await importFromTable(rows);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "导入失败" }, { status: 400 });
  }
}
