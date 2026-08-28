"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Job } from "@/lib/db";

const WORKFLOW_LABEL: Record<string, string> = {
  tryon: "服装换装",
  pose: "三种姿势",
  recolor: "服装复色",
};
const RUNNING = ["queued", "uploading", "submitting", "waiting_provider", "downloading", "validating", "optimizing", "saving", "generating"];
const FAILED = ["failed", "interrupted"];
const SUCCESS = ["success", "needs_review", "confirmed"];

type JobsResponse = Job[];

function statusLabel(job: Job): string {
  if (RUNNING.includes(job.phase || "")) return job.phase === "queued" ? "排队中" : "生成中";
  if (job.status === "failed") return "失败";
  if (job.status === "interrupted") return "已取消";
  if (job.status === "needs_review") return "待审核";
  if (job.status === "confirmed") return "已确认";
  return "已完成";
}

function statusClass(job: Job): string {
  if (RUNNING.includes(job.phase || "")) return "running";
  if (FAILED.includes(job.status)) return "failed";
  return "done";
}

export default function TaskCenter({
  open,
  onClose,
  onRunningCount,
}: {
  open: boolean;
  onClose: () => void;
  onRunningCount: (count: number) => void;
}) {
  const [jobs, setJobs] = useState<JobsResponse>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        const data = (await response.json()) as JobsResponse;
        if (!active) return;
        setJobs(Array.isArray(data) ? data : []);
      } catch {
        if (active) setError("任务列表读取失败");
      }
    };
    void load();
    timer.current = setInterval(() => void load(), 2500);
    return () => {
      active = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, [open]);

  const stats = useMemo(() => {
    const running = jobs.filter((job) => RUNNING.includes(job.phase || ""));
    const queued = jobs.filter((job) => job.phase === "queued");
    const failed = jobs.filter((job) => FAILED.includes(job.status));
    const done = jobs.filter((job) => SUCCESS.includes(job.status));
    return {
      running: running.length,
      queued: queued.length,
      failed: failed.length,
      done: done.length,
    };
  }, [jobs]);

  useEffect(() => {
    if (open) onRunningCount(stats.running);
  }, [stats.running, open, onRunningCount]);

  useEffect(() => {
    if (!open) onRunningCount(0);
  }, [open, onRunningCount]);

  if (!open) return null;

  async function retry(job: Job) {
    setBusy(job.id);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "重试失败");
    } catch (e) {
      setError(e instanceof Error ? e.message : "重试失败");
    } finally {
      setBusy("");
    }
  }
  async function cancel(job: Job) {
    setBusy(job.id);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "取消失败");
    } catch (e) {
      setError(e instanceof Error ? e.message : "取消失败");
    } finally {
      setBusy("");
    }
  }

  const recent = jobs.slice(0, 20);

  return (
    <div className="top-menu-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="top-menu-panel task-center-panel" role="dialog" aria-label="任务中心">
        <div className="top-menu-head">
          <div><b>任务中心</b><small>当前所有生成任务状态</small></div>
          <button className="top-menu-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>
        <div className="task-center-stats">
          <div className="running"><b>{stats.running}</b><span>生成中</span></div>
          <div className="queued"><b>{stats.queued}</b><span>排队</span></div>
          <div className="failed"><b>{stats.failed}</b><span>失败</span></div>
          <div className="done"><b>{stats.done}</b><span>已完成</span></div>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="task-center-list">
          {recent.length === 0 ? (
            <div className="empty-state compact"><div className="empty-icon">◇</div><b>暂无生成任务</b></div>
          ) : (
            recent.map((job) => (
              <div className={`task-row ${statusClass(job)}`} key={job.id}>
                <div className="task-row-main">
                  <span className={`task-status-dot ${statusClass(job)}`} />
                  <div>
                    <b>{WORKFLOW_LABEL[job.workflow] || job.workflow}</b>
                    <small>{job.sku} · {job.model || job.provider}</small>
                  </div>
                  <span className={`task-status-badge ${statusClass(job)}`}>{statusLabel(job)}</span>
                </div>
                {FAILED.includes(job.status) && job.error && (
                  <small className="task-error">{job.error}</small>
                )}
                <div className="task-row-actions">
                  {job.outputImages[0] && (
                    <a href={job.outputImages[0]} target="_blank" rel="noreferrer">查看结果</a>
                  )}
                  {FAILED.includes(job.status) && (
                    <button className="secondary" disabled={busy === job.id} onClick={() => void retry(job)}>重试</button>
                  )}
                  {RUNNING.includes(job.phase || "") && (
                    <button className="danger" disabled={busy === job.id} onClick={() => void cancel(job)}>取消</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
