import { NextResponse } from "next/server";
import { getProject, listJobs, updateProject } from "@/lib/db";
import { finalPackagePhotoCount } from "@/lib/final-package";
import { archiveFinalDeliverables } from "@/lib/final-archive";
import { cleanupSkuTemp } from "@/lib/qc-check";
import { hasExplicitFinalDir, runtimeFinalDir } from "@/lib/runtime-paths";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const project = await getProject(id);
    if (!project) throw new Error("项目不存在");
    if (finalPackagePhotoCount(project) === 0) throw new Error("当前货号还没有可导出的结果照片");
    const jobs = await listJobs({ projectId: id });
    const { archived } = await archiveFinalDeliverables(project, jobs);
    if (!archived.length) throw new Error("没有可写入正式成品目录的图片，请先确认最终结果");
    const updated = await updateProject(id, {
      status: "已完成",
      dependencyStatus: "current",
      stepStatuses: { ...project.stepStatuses, "5": "completed" },
    });
    let tempCleanedBytes = 0;
    // 最终确认后自动清理临时文件（默认开启）
    if (process.env.AI_STUDIO_DISABLE_AUTO_CLEAN !== "1") {
      tempCleanedBytes = await cleanupSkuTemp(project.sku);
    }
    return NextResponse.json({
      ...updated,
      archivedCount: archived.length,
      finalDir: runtimeFinalDir(),
      finalDirExplicit: hasExplicitFinalDir(),
      tempCleanedBytes,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法完成项目" }, { status: 400 });
  }
}
