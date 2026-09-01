"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/db";
import { projectModuleHref } from "@/lib/project-navigation";
import WorkflowModelSelector from "@/components/workbench/WorkflowModelSelector";
import WorkflowSkuExport from "@/components/workbench/WorkflowSkuExport";
import type { GenerationWorkflow } from "@/lib/ai/types";
import type { ModelWorkflowType } from "@/lib/ai/provider-settings-types";
import {
  AppLogo,
  IconCheck,
  IconChevron,
  IconClock,
  IconDoc,
  IconEye,
  IconFolder,
  IconGear,
  IconGrid,
  IconLibrary,
  IconPalette,
  IconPlus,
  IconPose,
  IconShirt,
} from "@/components/icons";
import TaskCenter from "@/components/TaskCenter";
import LocalFilesMenu from "@/components/LocalFilesMenu";
import ModelStatusMenu from "@/components/ModelStatusMenu";

const MODULES = [
  { segment: "details", icon: IconDoc, label: "商品资料" },
  { segment: "tryon", icon: IconShirt, label: "服装换装" },
  { segment: "pose", icon: IconPose, label: "三种姿势" },
  { segment: "recolor", icon: IconPalette, label: "服装复色" },
  { segment: "final", icon: IconCheck, label: "最终结果" },
];

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(),
    router = useRouter();
  const [collapsed, setCollapsed] = useState(false),
    [apiState, setApiState] = useState("检查中"),
    [monthly, setMonthly] = useState(0),
    [projects, setProjects] = useState<Project[]>([]),
    [projectsLoaded, setProjectsLoaded] = useState(false),
    [projectQuery, setProjectQuery] = useState(""),
    [activeMenu, setActiveMenu] = useState<"tasks" | "files" | "model" | null>(null),
    [runningCount, setRunningCount] = useState(0),
    [refreshing, setRefreshing] = useState(false);
  const parts = pathname.split("/"),
    projectId = pathname.startsWith("/projects/") ? parts[2] : "",
    activeModule = parts[3] || "",
    activeWorkflow = (["tryon", "pose", "recolor"] as const).includes(
      activeModule as GenerationWorkflow,
    )
      ? (activeModule as GenerationWorkflow)
      : undefined,
    activeModelWorkflow: ModelWorkflowType | undefined =
      activeModule === "details" ? "product" : activeWorkflow,
    current = useMemo(
      () => projects.find((project) => project.id === projectId),
      [projects, projectId],
    );
  useEffect(() => {
    setProjectsLoaded(false);
    fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        const items = await response.json();
        if (!response.ok || !Array.isArray(items))
          throw new Error("商品项目加载失败");
        setProjects(items);
        const found = items.find(
          (project: Project) => project.id === projectId,
        );
        if (found) setProjectQuery(`${found.sku} ${found.productName}`);
      })
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoaded(true));
    Promise.all([
      fetch("/api/settings").then((response) => response.json()),
      fetch("/api/jobs").then((response) => response.json()),
    ])
      .then(([health, jobs]) => {
        setApiState(health.overallStatus || "全部未配置");
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        setMonthly(
          Array.isArray(jobs)
            ? jobs.filter(
                (job: { startedAt: string }) =>
                  new Date(job.startedAt) >= start,
              ).length
            : 0,
        );
      })
      .catch(() => setApiState("API异常"));
  }, [projectId]);
  function choose(value: string) {
    setProjectQuery(value);
    const project = projects.find(
      (item) =>
        `${item.sku} ${item.productName}` === value || item.sku === value,
    );
    if (project)
      router.push(
        `/projects/${project.id}${activeModule ? `/${activeModule}` : ""}`,
      );
  }
  async function refreshCurrentPage() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // 1. 重新获取当前页面的项目与任务数据，触发 Workspace 内部 refresh
      window.dispatchEvent(new Event("workbench:refresh"));
      // 2. 重新拉取头部相关状态（项目列表、API 状态、本月任务数）
      const [projectData, settingsData, jobsData] = await Promise.all([
        fetch("/api/projects", { cache: "no-store" }).then((r) => r.json()).catch(() => []),
        fetch("/api/settings").then((r) => r.json()).catch(() => null),
        fetch("/api/jobs").then((r) => r.json()).catch(() => []),
      ]);
      if (Array.isArray(projectData)) {
        setProjects(projectData);
        const found = projectData.find(
          (item: Project) => item.id === projectId,
        );
        if (found) setProjectQuery(`${found.sku} ${found.productName}`);
      }
      if (settingsData?.overallStatus) setApiState(settingsData.overallStatus);
      if (Array.isArray(jobsData)) {
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        setMonthly(
          jobsData.filter(
            (job: { startedAt: string }) => new Date(job.startedAt) >= start,
          ).length,
        );
      }
    } finally {
      setRefreshing(false);
    }
  }
  const moduleHref = (segment: string) =>
    projectModuleHref(
      segment,
      projectId,
      projects.map((project) => project.id),
      projectsLoaded,
    );
  return (
    <div className={collapsed ? "app-shell nav-collapsed" : "app-shell"}>
      <header className="global-header">
        <Link className="wordmark" href="/workbench">
          <span className="wordmark-icon"><AppLogo /></span>
          <b>AI服装工作台</b>
        </Link>
        <div className="project-selector">
          <span>项目 /</span>
          <input
            list="project-options"
            value={projectQuery}
            onChange={(event) => choose(event.target.value)}
            placeholder="搜索SKU或商品名称"
            aria-label="项目选择器"
          />
          <datalist id="project-options">
            {projects.slice(0, 20).map((project) => (
              <option
                key={project.id}
                value={`${project.sku} ${project.productName}`}
              />
            ))}
          </datalist>
          {current && (
            <span className="current-project-dot" title="当前项目">
              ●
            </span>
          )}
          <Link href="/workbench" title="新建商品项目" className="project-new-link">
            <IconPlus />
          </Link>
        </div>
        <div className="global-spacer" />
        <button className={`api-pill ${apiState === "API正常" ? "ok" : "warn"}`} onClick={() => setActiveMenu("model")} title="模型状态">
          ● {apiState}
        </button>
        {activeWorkflow && current && (
          <WorkflowSkuExport
            project={current}
            workflow={activeWorkflow}
            onSaved={(next) =>
              setProjects((items) =>
                items.map((item) => (item.id === next.id ? next : item)),
              )
            }
          />
        )}{" "}
        {activeModelWorkflow && (
          <WorkflowModelSelector workflow={activeModelWorkflow} />
        )}
        <button className={`icon-button ${refreshing ? "refreshing" : ""}`} title="刷新当前页面数据" aria-label="刷新" disabled={refreshing} onClick={() => void refreshCurrentPage()}>
          <span aria-hidden="true">{refreshing ? "…" : "↻"}</span>
        </button>
        <button className={`icon-button ${activeMenu === "tasks" ? "active" : ""}`} title="任务中心" onClick={() => setActiveMenu(activeMenu === "tasks" ? null : "tasks")}>
          <IconClock />
          {runningCount > 0 && <span className="icon-badge">{runningCount}</span>}
        </button>
        <button className={`icon-button ${activeMenu === "files" ? "active" : ""}`} title="本地文件" onClick={() => setActiveMenu(activeMenu === "files" ? null : "files")}>
          <IconFolder />
        </button>
      </header>
      <aside className="sidebar">
        <div className="sidebar-scroll">
          <section className="nav-section">
            <p className="nav-group">工作台</p>
            <Link
              className={
                pathname === "/workbench" ? "nav-link active" : "nav-link"
              }
              href="/workbench"
            >
              <span className="nav-icon"><IconGrid /></span>
              <span className="nav-label">商品项目</span>
            </Link>
          </section>
          <section className="nav-section">
            <p className="nav-group">制作流程</p>
            {MODULES.map((item) => {
              const href = moduleHref(item.segment),
                ItemIcon = item.icon,
                content = (
                  <>
                    <span className="nav-icon"><ItemIcon /></span>
                    <span className="nav-label">{item.label}</span>
                  </>
                );
              return href ? (
                <button
                  type="button"
                  className={`${activeModule === item.segment ? "nav-link active" : "nav-link"} workflow-nav-button`}
                  onClick={() => router.push(href)}
                  key={item.segment}
                  title={item.label}
                >
                  {content}
                </button>
              ) : (
                <button
                  type="button"
                  className="nav-link disabled"
                  key={item.segment}
                  title={
                    projectsLoaded ? "请先新建商品项目" : "正在加载商品项目"
                  }
                  onClick={() =>
                    alert(
                      projectsLoaded
                        ? "请先新建商品项目，再进入制作流程。"
                        : "商品项目正在加载，请稍候。",
                    )
                  }
                >
                  {content}
                </button>
              );
            })}
          </section>
          <section className="nav-section">
            <p className="nav-group">素材与模板</p>
            <Link
              className={
                pathname.startsWith("/libraries/poses") || pathname.startsWith("/inventory/poses")
                  ? "nav-link active"
                  : "nav-link"
              }
              href="/libraries/poses"
            >
              <span className="nav-icon"><IconLibrary /></span>
              <span className="nav-label">姿势库</span>
            </Link>
            <Link
              className={
                pathname.startsWith("/visual-reference")
                  ? "nav-link active"
                  : "nav-link"
              }
              href="/visual-reference"
            >
              <span className="nav-icon"><IconEye /></span>
              <span className="nav-label">视觉参考</span>
            </Link>
          </section>
          <section className="nav-section">
            <p className="nav-group">管理</p>
            <Link
              className={
                pathname === "/history" ? "nav-link active" : "nav-link"
              }
              href="/history"
            >
              <span className="nav-icon"><IconClock /></span>
              <span className="nav-label">历史任务</span>
            </Link>
            <Link
              className={
                pathname === "/settings" ? "nav-link active" : "nav-link"
              }
              href="/settings"
            >
              <span className="nav-icon"><IconGear /></span>
              <span className="nav-label">API与模型设置</span>
            </Link>
          </section>
        </div>
        <div className="usage-card">
          <span>本月生成任务</span>
          <strong>{monthly}</strong>
          <small>来自真实任务记录</small>
        </div>
        <button
          className="collapse-button"
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? "展开导航" : "折叠导航"}
        >
          <IconChevron style={{ transform: collapsed ? "rotate(180deg)" : "none" }} />
        </button>
      </aside>
      <main className="app-main">{children}</main>
      <TaskCenter open={activeMenu === "tasks"} onClose={() => setActiveMenu(null)} onRunningCount={setRunningCount} />
      <LocalFilesMenu open={activeMenu === "files"} onClose={() => setActiveMenu(null)} sku={current?.sku} />
      <ModelStatusMenu open={activeMenu === "model"} onClose={() => setActiveMenu(null)} />
    </div>
  );
}
