import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject, updateProject } from "@/lib/db";

const taskType = z.enum(["换装", "复色", "三姿势", "白底图", "高清优化", "局部修改", "产品展示图"]);
const schema = z.object({
  taskTypes: z.array(taskType).min(1).optional(),
  designLevel: z.enum(["simple", "complex", "needs_review"]).optional(),
  selectedPoseGroupId: z.string().max(160).optional(),
  confirm: z.boolean().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const project = await getProject((await params).id);
  if (!project) return NextResponse.json({ error: "SKU 项目不存在" }, { status: 404 });
  return NextResponse.json({
    projectId: project.id,
    sku: project.sku,
    source: project.spreadsheetSource,
    imageRefs: project.sourceImageRefs,
    garmentProfile: project.garmentProfile,
    task: project.productionTask,
    colors: project.colorVariantBindings,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const project = await getProject(id);
    if (!project || !project.productionTask) throw new Error("SKU 生产方案不存在");
    const input = schema.parse(await request.json());
    const task = {
      ...project.productionTask,
      taskTypes: input.taskTypes || project.productionTask.taskTypes,
      designLevel: input.designLevel || project.productionTask.designLevel,
      status: input.confirm ? "ready" as const : project.productionTask.status,
      updatedAt: new Date().toISOString(),
    };
    if (input.confirm && !project.sourceImageRefs?.product.length && !project.assets.garmentImage) throw new Error("请先补充产品服装图路径");
    if (input.confirm && !task.taskTypes.length) throw new Error("制作要求尚未识别任务类型，请先人工补充");
    const updated = await updateProject(id, {
      productionTask: task,
      selectedPoseTemplateGroupId: input.selectedPoseGroupId || project.selectedPoseTemplateGroupId,
      status: input.confirm ? "生产方案已确认" : project.status,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生产方案保存失败" }, { status: 400 });
  }
}
