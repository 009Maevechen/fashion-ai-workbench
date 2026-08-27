"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ApiProviderPublic,
  WorkflowModelBindings,
  WorkflowRuntimeSummary,
} from "@/lib/ai/provider-settings-types";
import type { ModelWorkflowType } from "@/lib/ai/provider-settings-types";

const LABEL: Record<ModelWorkflowType, string> = {
  product: "产品识别",
  tryon: "换装",
  pose: "姿势",
  recolor: "复色",
  qc: "QC检查",
  research: "爆款研究",
  assistant: "AI助手",
};

function supportsWorkflow(
  provider: ApiProviderPublic,
  workflow: ModelWorkflowType,
) {
  if (workflow === "product")
    return [
      "syc-openai-compatible",
      "openai-compatible",
      "volcengine",
      "custom",
    ].includes(provider.type);
  if (workflow === "tryon") return true;
  return provider.type !== "bfl" && provider.type !== "fashn";
}

export default function WorkflowModelSelector({
  workflow,
  runtime,
}: {
  workflow: ModelWorkflowType;
  runtime?: WorkflowRuntimeSummary[ModelWorkflowType];
}) {
  const [providers, setProviders] = useState<ApiProviderPublic[]>([]),
    [bindings, setBindings] = useState<WorkflowModelBindings>(),
    [runtimeState, setRuntimeState] = useState(runtime),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/settings/providers", { cache: "no-store" }).then((response) =>
        response.json(),
      ),
      fetch("/api/settings/workflow-models", { cache: "no-store" }).then(
        (response) => response.json(),
      ),
    ])
      .then(([providerData, bindingData]) => {
        if (!active) return;
        setProviders(Array.isArray(providerData) ? providerData : []);
        setBindings(bindingData.bindings);
        setRuntimeState(bindingData.runtime?.[workflow] || runtime);
      })
      .catch(() => {
        if (active) setError("模型列表读取失败");
      });
    return () => {
      active = false;
    };
  }, [runtime, workflow]);
  const options = useMemo(
    () =>
      providers.filter(
        (provider) =>
          provider.enabled &&
          provider.hasApiKey &&
          Boolean(provider.baseUrl) &&
          Boolean(
            workflow === "product"
              ? provider.visionModel
              : provider.defaultModel,
          ) &&
          supportsWorkflow(provider, workflow),
      ),
    [providers, workflow],
  );
  const environmentAvailable = Boolean(
    runtimeState?.primary.configured &&
    runtimeState.primary.source === "environment",
  );
  const current =
    bindings?.[workflow].primary?.providerId ||
    (environmentAvailable ? "environment" : "");

  async function choose(value: string) {
    if (!bindings || busy) return;
    const provider = options.find((item) => item.id === value);
    if (value !== "environment" && !provider) return;
    setBusy(true);
    setError("");
    try {
      const selectedModel =
        workflow === "product" ? provider?.visionModel : provider?.defaultModel;
      const next: WorkflowModelBindings = {
        ...bindings,
        [workflow]: {
          ...bindings[workflow],
          primary:
            provider && selectedModel
              ? { providerId: provider.id, model: selectedModel }
              : undefined,
        },
      };
      const response = await fetch("/api/settings/workflow-models", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error || "模型切换失败");
      setBindings(data.bindings);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "模型切换失败");
      setBusy(false);
    }
  }

  if (!environmentAvailable && options.length === 0) return null;
  return (
    <div className="workflow-model-selector">
      <label>
        <span>{LABEL[workflow]}模型</span>
        <select
          aria-label={`选择${LABEL[workflow]}模型`}
          value={current}
          disabled={busy || !bindings}
          onChange={(event) => void choose(event.target.value)}
        >
          {environmentAvailable && runtimeState && (
            <option value="environment">
              {runtimeState.primary.providerName} · {runtimeState.primary.model}
            </option>
          )}
          {options.map((provider) => (
            <option value={provider.id} key={provider.id}>
              {provider.name} ·{" "}
              {workflow === "product"
                ? provider.visionModel
                : provider.defaultModel}
            </option>
          ))}
        </select>
      </label>
      {error && <small>{error}</small>}
    </div>
  );
}
