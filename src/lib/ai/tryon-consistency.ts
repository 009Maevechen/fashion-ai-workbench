import "server-only";
import type { Job, Project } from "../db";
import type { TryOnConsistencyReport } from "../tryon-edit-pipeline";
import { resolveTryOnConsistencyReport } from "../tryon-edit-pipeline";
import { checkGarmentConsistency } from "./garment-consistency";
import { checkTryonSubjectFidelity } from "./tryon-subject-fidelity";

/**
 * 换装统一一致性检查。
 * productImage/modelImage/outputImage 分别来自 job.inputImages[1]、
 * job.inputImages[0]、job.outputImages[0]；garmentRules 来自项目细节锁。
 */
export async function runTryOnConsistencyCheck(
  project: Project,
  job: Job,
): Promise<{
  report: TryOnConsistencyReport;
  subject: Awaited<ReturnType<typeof checkTryonSubjectFidelity>>;
  garment: Awaited<ReturnType<typeof checkGarmentConsistency>>;
}> {
  if (job.workflow !== "tryon") throw new Error("只允许检查服装换装任务");
  const [subject, garment] = await Promise.all([
    checkTryonSubjectFidelity(project, job),
    checkGarmentConsistency(project, job),
  ]);
  const report = resolveTryOnConsistencyReport({
    subject,
    garment,
    repairTargets: garment.repairTargets,
  });
  return { report, subject, garment };
}
