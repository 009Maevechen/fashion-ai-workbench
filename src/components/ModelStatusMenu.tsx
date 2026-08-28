"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ProviderStatus = {
  name: string;
  type: string;
  enabled: boolean;
  configured: boolean;
  lastTestStatus: string;
  lastError?: string;
};
type WorkflowStatus = {
  key: string;
  label: string;
  primary: { configured: boolean; providerName: string; model: string; error?: string };
  fallback: { configured: boolean; providerName: string; model: string; error?: string };
};
type ModelStatusData = { providers: ProviderStatus[]; workflows: WorkflowStatus[] };

const STATUS_LABEL: Record<string, string> = {
  success: "正常",
  failed: "测试失败",
  auth_failed: "认证失败",
  rate_limited: "限流",
  model_not_found: "模型不存在",
  untested: "未测试",
};

function providerState(provider: ProviderStatus): { label: string; cls: string } {
  if (!provider.enabled) return { label: "已停用", cls: "muted" };
  if (provider.lastTestStatus === "success") return { label: "正常", cls: "ok" };
  if (provider.lastTestStatus && provider.lastTestStatus !== "untested") return { label: STATUS_LABEL[provider.lastTestStatus] || "异常", cls: "err" };
  if (provider.configured) return { label: "已配置", cls: "ok" };
  return { label: "未配置", cls: "muted" };
}

export default function ModelStatusMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<ModelStatusData | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/settings/model-status", { cache: "no-store" })
      .then((response) => response.json())
      .then((value) => setData(value))
      .catch(() => setData(null));
  }, [open]);

  if (!open) return null;

  return (
    <div className="top-menu-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="top-menu-panel model-status-panel" role="dialog" aria-label="模型状态">
        <div className="top-menu-head">
          <div><b>模型状态</b><small>Provider 与工作流模型配置情况</small></div>
          <button className="top-menu-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>
        {!data ? (
          <div className="empty-state compact"><div className="empty-icon">◇</div><b>状态读取中…</b></div>
        ) : (
          <>
            <div className="model-status-section">
              <p className="model-status-title">Provider</p>
              {data.providers.length === 0 ? (
                <small className="muted">还没有配置任何 API Provider</small>
              ) : (
                data.providers.map((provider) => {
                  const state = providerState(provider);
                  return (
                    <div className="model-status-row" key={provider.name}>
                      <span>{provider.name}</span>
                      <span className={`model-status-badge ${state.cls}`}>{state.label}</span>
                      {provider.lastError && <small className="danger-text">{provider.lastError.slice(0, 40)}</small>}
                    </div>
                  );
                })
              )}
            </div>
            <div className="model-status-section">
              <p className="model-status-title">工作流模型</p>
              {data.workflows.map((workflow) => (
                <div className="model-status-row workflow" key={workflow.key}>
                  <span>{workflow.label}</span>
                  <span className={`model-status-badge ${workflow.primary.configured ? "ok" : "muted"}`}>
                    {workflow.primary.configured ? `${workflow.primary.providerName} / ${workflow.primary.model}` : "未配置"}
                  </span>
                </div>
              ))}
            </div>
            <Link className="button secondary model-status-settings-link" href="/settings" onClick={onClose}>
              进入API与模型设置 →
            </Link>
          </>
        )}
      </aside>
    </div>
  );
}
