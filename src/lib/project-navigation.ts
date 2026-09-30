import type { Project } from "@/lib/db";

export const PROJECT_SEGMENTS = ["details", "tryon", "pose", "recolor", "final"] as const;
export type ProjectSegment = (typeof PROJECT_SEGMENTS)[number];

export function projectModuleHref(segment: string, currentProjectId: string, _projectIds: string[], projectsLoaded: boolean) {
  if (!projectsLoaded || !currentProjectId || !PROJECT_SEGMENTS.includes(segment as ProjectSegment)) return null;
  return `/projects/${currentProjectId}/${segment}`;
}

export function projectStepHref(projectId: string, step: number) {
  const segment = PROJECT_SEGMENTS[step - 1] || PROJECT_SEGMENTS[0];
  return `/projects/${projectId}/${segment}`;
}

export function projectStepFromPath(pathname: string, fallback: number) {
  const segment = pathname.split("/")[3];
  const routeStep = PROJECT_SEGMENTS.indexOf(segment as ProjectSegment) + 1;
  return routeStep || Math.min(Math.max(fallback || 1, 1), PROJECT_SEGMENTS.length);
}

export function projectResumeHref(project: Pick<Project, "id" | "currentStep" | "stepStatuses">) {
  const needsAttention = PROJECT_SEGMENTS.findIndex((_, index) =>
    ["failed", "needs_redo", "stale", "awaiting_confirmation", "partial_success"].includes(
      project.stepStatuses?.[String(index + 1)] || "",
    ),
  );
  return projectStepHref(project.id, needsAttention >= 0 ? needsAttention + 1 : project.currentStep);
}

export function workbenchSkuHref(sku: string) {
  return `/workbench?sku=${encodeURIComponent(sku)}#sku-project-list`;
}
