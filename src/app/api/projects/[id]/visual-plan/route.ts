import { NextResponse } from "next/server";
import { getProject } from "@/lib/db";
import { readVisualReferenceManifest } from "@/lib/visual-reference";
import { buildProductionPlan } from "@/lib/visual-production-plan";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const project = await getProject(id);
    if (!project) throw new Error("项目不存在");
    const manifest = await readVisualReferenceManifest();
    const plan = buildProductionPlan(project, manifest.poseGroups, manifest.images);
    return NextResponse.json(plan);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成视觉生产方案失败" }, { status: 400 });
  }
}
