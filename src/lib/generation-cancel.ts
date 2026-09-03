import type {Job} from "./db";
import type {WorkflowType} from "./ai/types";

// 运行中的阶段：这些阶段内点击「暂停生图」会立即标记中断。
export const RUNNING_PHASES = ["queued", "uploading", "submitting", "waiting_provider", "downloading", "validating", "optimizing", "saving", "generating"] as const;

export function isJobRunning(job: Job): boolean {
  if ((job.phase && RUNNING_PHASES.includes(job.phase as (typeof RUNNING_PHASES)[number])) || job.status === "generating" || job.status === "queued") return true;
  return false;
}

export function isWorkflowGenerating(jobs: Job[], workflow: WorkflowType): boolean {
  return jobs.some((job) => job.workflow === workflow && isJobRunning(job));
}

// 取消标记：用于让正在执行中的 runOne 在出图前自检并中止，避免取消后仍把结果写回。
type CancelRuntime = typeof globalThis & { __workbenchCancelGeneration?: Set<string> };

const runtime = () => globalThis as CancelRuntime;
const key = (projectId: string, workflow: WorkflowType) => `${projectId}:${workflow}`;

export function markGenerationCancelled(projectId: string, workflow: WorkflowType) {
  const set = runtime().__workbenchCancelGeneration ?? new Set<string>();
  runtime().__workbenchCancelGeneration = set;
  set.add(key(projectId, workflow));
}

export function isGenerationCancelled(projectId: string, workflow: WorkflowType) {
  return Boolean(runtime().__workbenchCancelGeneration?.has(key(projectId, workflow)));
}

export function clearGenerationCancellation(projectId: string, workflow: WorkflowType) {
  runtime().__workbenchCancelGeneration?.delete(key(projectId, workflow));
}
