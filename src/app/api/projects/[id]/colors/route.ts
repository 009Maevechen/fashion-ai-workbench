import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getProject, updateProject, type TargetColor } from "@/lib/db";
import { z } from "zod";

const schema = z.object({ name: z.string().trim().min(1).max(60) });

// 新增一个颜色款：用户输入颜色名称（或 AI 建议名称），后续单独上传该款参考图。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { name } = schema.parse(await request.json().catch(() => ({})));
    const project = await getProject((await params).id);
    if (!project) throw new Error("项目不存在");
    const colors = project.targetColors || [];
    const color: TargetColor = {
      id: crypto.randomUUID(),
      name,
      userConfirmedName: name,
      structureMode: "same_style",
      styleRelation: "same",
      referenceImages: [],
      status: "draft",
    };
    await updateProject(project.id, { targetColors: [...colors, color] });
    return NextResponse.json({ colorId: color.id, color });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "新增颜色失败" },
      { status: 400 },
    );
  }
}
