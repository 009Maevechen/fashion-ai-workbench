"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ApiProviderPublic,
  ApiProviderType,
  ModelWorkflowType,
  WorkflowModelBindings,
  WorkflowRuntimeSummary,
} from "@/lib/ai/provider-settings-types";
import { inferCapabilities, CAPABILITY_LABELS } from "@/lib/model-capability-utils";

const TYPE_LABEL: Record<ApiProviderType, string> = {
  "openai-compatible": "OpenAI兼容中转站",
  "syc-openai-compatible": "SYC 中转站",
  fashn: "FASHN",
  bfl: "BFL / FLUX",
  volcengine: "火山方舟",
  flux: "FLUX兼容接口",
  custom: "自定义兼容接口",
};

const WORKFLOWS: {
  key: ModelWorkflowType;
  label: string;
  description: string;
}[] = [
  { key: "product", label: "商品视觉识别", description: "产品类型识别、商品属性识别、细节提取、自动标签；需支持图片输入和文字输出的视觉理解模型" },
  { key: "tryon", label: "服装换装", description: "产品图＋模特图换装，需要图片编辑能力" },
  { key: "pose", label: "三种姿势", description: "商品模特图＋姿势参考图，三次独立图片编辑" },
  { key: "recolor", label: "服装复色", description: "三张姿势图分别精准复色，需要图片编辑能力" },
  { key: "qc", label: "QC质量检查", description: "商品结构比对、模特一致性、面料、手部异常、露脸检测，需要视觉理解模型" },
  { key: "research", label: "爆款研究 / 文本分析", description: "爆款共同点、趋势研究、设计Brief、卖点总结，需要文本推理模型（预留）" },
  { key: "assistant", label: "工作台AI助手", description: "工作台内通用文本问答（预留）" },
];

function supportsWorkflow(provider: ApiProviderPublic, workflow: ModelWorkflowType) {
  if (workflow === "product" || workflow === "qc")
    return ["syc-openai-compatible", "openai-compatible", "volcengine", "custom"].includes(provider.type);
  if (workflow === "research" || workflow === "assistant")
    return ["syc-openai-compatible", "openai-compatible", "volcengine", "custom"].includes(provider.type);
  if (workflow === "tryon") return true;
  return provider.type !== "bfl" && provider.type !== "fashn";
}

export default function WorkflowModelAssignment({
  initialBindings,
  initialRuntime,
}: {
  initialBindings: WorkflowModelBindings;
  initialRuntime: WorkflowRuntimeSummary;
}) {
  const [providers, setProviders] = useState<ApiProviderPublic[]>([]),
    [bindings, setBindings] = useState(initialBindings),
    [runtime, setRuntime] = useState(initialRuntime),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [expanded, setExpanded] = useState(true);
  useEffect(() => {
    fetch("/api/settings/providers", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setProviders(Array.isArray(data) ? data : []))
      .catch(() => setError("模型列表读取失败"));
  }, []);
  const enabledProviders = useMemo(
    () => providers.filter((provider) => provider.enabled),
    [providers],
  );

  function updateSelection(workflow: ModelWorkflowType, slot: "primary" | "fallback", providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) {
      setBindings((current) => ({ ...current, [workflow]: { ...current[workflow], [slot]: undefined } }));
      return;
    }
    // 按工作流取最合适的模型字段，依次回退，避免写入空字符串
    const model =
      workflow === "product"
        ? slot === "primary" ? provider.visionModel || provider.defaultModel : provider.chatModel || provider.defaultModel
        : workflow === "qc"
          ? provider.visionModel || provider.chatModel || provider.defaultModel
          : workflow === "research" || workflow === "assistant"
            ? provider.chatModel || provider.defaultModel
            : provider.defaultModel;
    setBindings((current) => ({
      ...current,
      [workflow]: { ...current[workflow], [slot]: { providerId: provider.id, model: model || "" } },
    }));
  }
  function updateModel(workflow: ModelWorkflowType, slot: "primary" | "fallback", model: string) {
    setBindings((current) => {
      const selection = current[workflow][slot];
      return selection
        ? { ...current, [workflow]: { ...current[workflow], [slot]: { ...selection, model } } }
        : current;
    });
  }
  function providerOptionLabel(provider: ApiProviderPublic) {
    return `${provider.name} · ${provider.defaultModel || TYPE_LABEL[provider.type]}`;
  }
  function capabilityHint(provider: ApiProviderPublic, workflow: ModelWorkflowType, slot: "primary" | "fallback") {
    const model =
      workflow === "product"
        ? slot === "primary" ? provider.visionModel : provider.chatModel
        : workflow === "qc"
          ? provider.visionModel || provider.chatModel
          : workflow === "research" || workflow === "assistant"
            ? provider.chatModel || provider.defaultModel
            : provider.defaultModel;
    if (!model) return "";
    const caps = inferCapabilities(provider.type, model);
    const labels = caps.map((cap) => CAPABILITY_LABELS[cap]);
    return labels.length ? ` · [${labels.join(" / ")}]` : "";
  }
  function workflowProviderOptionLabel(provider: ApiProviderPublic, workflow: ModelWorkflowType, slot: "primary" | "fallback") {
    if (workflow === "product") {
      const model = slot === "primary" ? provider.visionModel : provider.chatModel;
      return `${provider.name} · ${model || (slot === "primary" ? "未配置图片识别模型" : "未配置对话模型")}`;
    }
    if (workflow === "qc") {
      const model = provider.visionModel || provider.chatModel;
      return `${provider.name} · ${model || "未配置视觉模型"}`;
    }
    if (workflow === "research" || workflow === "assistant") {
      const model = provider.chatModel || provider.defaultModel;
      return `${provider.name} · ${model || "未配置文本模型"}`;
    }
    return providerOptionLabel(provider);
  }
  function environmentOptionLabel(summary: WorkflowRuntimeSummary[ModelWorkflowType]["primary"]) {
    return summary.configured
      ? `使用现有环境变量配置 · ${summary.providerName} / ${summary.model}`
      : "使用现有环境变量配置";
  }

  async function saveBindings() {
    // 前端先校验：已选择 Provider 但模型名为空的绑定，给出清晰提示，避免后端 zod 报难懂的错误
    for (const workflow of WORKFLOWS) {
      for (const slot of ["primary", "fallback"] as const) {
        const selection = bindings[workflow.key][slot];
        if (selection && !selection.model.trim()) {
          setError(`「${workflow.label}」的${slot === "primary" ? "主" : "备用"}模型已选择提供商但模型名称为空，请填写模型名称（例如 mix-gpt-5.4）`);
          return;
        }
      }
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/workflow-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bindings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "模型绑定保存失败");
      setBindings(data.bindings);
      setRuntime(data.runtime);
      setMessage("七个工作流的主模型与备用模型已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "模型绑定保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`card workflow-assignment-section ${expanded ? "expanded" : "collapsed"}`}>
      <div className="panel-head">
        <div>
          <h2>工作流模型分配</h2>
          <small>{expanded ? "不同模型负责不同任务，每个流程支持主模型与备用模型；能力不匹配的模型无法保存" : "已收起，需要调整模型时再展开"}</small>
        </div>
        <button type="button" className="secondary workflow-assignment-toggle" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded ? "收起模型分配 ↑" : "展开模型分配 ↓"}</button>
      </div>
      {expanded && <>
      {(error || message) && <div className={error ? "error" : "notice"}>{error || message}</div>}
      <div className="workflow-binding-grid">
        {WORKFLOWS.map((workflow) => {
          const current = bindings[workflow.key],
            summary = runtime[workflow.key],
            compatibleProviders = enabledProviders.filter((provider) => supportsWorkflow(provider, workflow.key));
          return (
            <article className="binding-card" key={workflow.key}>
              <h3>{workflow.label}</h3>
              <p>{workflow.description}</p>
              {(["primary", "fallback"] as const).map((slot) => (
                <div className="binding-slot" key={slot}>
                  <b>
                    {workflow.key === "product"
                      ? slot === "primary" ? "图片识别模型" : "对话模型"
                      : workflow.key === "qc"
                        ? slot === "primary" ? "QC视觉模型" : "QC备用视觉模型"
                        : workflow.key === "research" || workflow.key === "assistant"
                          ? slot === "primary" ? "主文本模型" : "备用文本模型"
                          : slot === "primary" ? "主模型" : "备用模型"}
                  </b>
                  <select
                    value={current[slot]?.providerId || ""}
                    onChange={(e) => updateSelection(workflow.key, slot, e.target.value)}
                  >
                    <option value="">
                      {workflow.key === "product"
                        ? slot === "primary" ? "选择图片识别 API" : "选择对话 API"
                        : workflow.key === "qc"
                          ? slot === "primary" ? "选择QC视觉模型 API" : "不配置备用模型"
                          : workflow.key === "research" || workflow.key === "assistant"
                            ? slot === "primary" ? "选择文本模型 API" : "不配置备用模型"
                            : slot === "primary" ? environmentOptionLabel(summary.primary) : "不配置备用模型"}
                    </option>
                    {compatibleProviders.map((provider) => (
                      <option value={provider.id} key={provider.id}>
                        {workflowProviderOptionLabel(provider, workflow.key, slot)}{capabilityHint(provider, workflow.key, slot)}
                      </option>
                    ))}
                  </select>
                  <input
                    disabled={!current[slot]}
                    value={current[slot]?.model || ""}
                    onChange={(e) => updateModel(workflow.key, slot, e.target.value)}
                    placeholder={
                      workflow.key === "product"
                        ? slot === "primary" ? "图片识别模型 ID" : "对话模型 ID"
                        : workflow.key === "qc"
                          ? "视觉理解模型 ID"
                          : workflow.key === "research" || workflow.key === "assistant"
                            ? "文本模型 ID"
                            : "模型名称"
                    }
                  />
                  <small className={summary[slot].configured ? "binding-ok" : "binding-warn"}>
                    {summary[slot].configured
                      ? `当前：${summary[slot].providerName} / ${summary[slot].model}`
                      : summary[slot].error || "未配置"}
                  </small>
                </div>
              ))}
            </article>
          );
        })}
      </div>
      <div className="settings-dialog-actions">
        <span />
        <button className="primary" disabled={busy} onClick={() => void saveBindings()}>
          {busy ? "保存中…" : "保存工作流模型分配"}
        </button>
      </div>
      </>}
    </section>
  );
}
