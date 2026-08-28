import { NextResponse } from "next/server";
import { getJob, listOperations, patchJob, patchOperation } from "@/lib/db";

/** 取消一个进行中的生成任务：标记任务与所属操作中断。 */
export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = (await params).id;
    const job = await getJob(id);
    if (!job) throw new Error("生成任务不存在");
    if (job.phase && ["success", "failed", "interrupted"].includes(job.phase))
      throw new Error("任务已结束，无法取消");
    const now = new Date().toISOString();
    await patchJob(id, {
      status: "interrupted",
      requestStatus: "interrupted",
      phase: "interrupted",
      error: "任务已被用户取消",
      errorMessage: "任务已被用户取消",
      finishedAt: now,
      requestFinishedAt: now,
    });
    const operations = await listOperations(job.projectId);
    const operation = operations.find((item) => item.jobIds.includes(id));
    if (operation && ["queued", "running"].includes(operation.status)) {
      await patchOperation(operation.id, { status: "interrupted", error: "任务已被用户取消" });
    }
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "取消失败" },
      { status: 400 },
    );
  }
}
