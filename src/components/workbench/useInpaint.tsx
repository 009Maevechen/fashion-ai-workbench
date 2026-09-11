"use client";
import {useState} from "react";
import type {Job,Project} from "@/lib/db";
import InpaintDialog,{type InpaintRequest} from "./InpaintDialog";

/**
 * 统一的局部重绘能力 hook：管理对话框打开状态与提交。
 * 复用于换装 / 三姿势 / 复色等所有出图步骤。
 */
export function useInpaint({
  project,
  sourceStep,
  submit,
  onResult,
}: {
  project: Project;
  sourceStep: Job["workflow"];
  submit: (url: string, body: unknown) => Promise<unknown>;
  onResult?: (job: Job) => void;
}) {
  const [inpaintJob, setInpaintJob] = useState<Job | null>(null);
  const [inpaintBusy, setInpaintBusy] = useState(false);

  function openInpaint(job: Job) {
    setInpaintJob(job);
  }
  function closeInpaint() {
    if (inpaintBusy) return;
    setInpaintJob(null);
  }
  async function submitInpaint(request: InpaintRequest) {
    setInpaintBusy(true);
    try {
      const result = await submit("/api/inpaint", {
        projectId: project.id,
        ...request,
        mode: "quality",
      });
      onResult?.(result as Job);
      closeInpaint();
    } finally {
      setInpaintBusy(false);
    }
  }

  const dialog = inpaintJob ? (
    <InpaintDialog
      job={inpaintJob}
      sourceStep={sourceStep}
      busy={inpaintBusy}
      onSubmit={(request) => void submitInpaint(request)}
      onClose={closeInpaint}
    />
  ) : null;

  return { openInpaint, closeInpaint, dialog };
}
