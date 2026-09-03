"use client";

import { useEffect, useState } from "react";
import type { SycConfigPublic } from "@/lib/ai/provider-settings-types";

type FormState = {
  name: string;
  baseUrl: string;
  apiKey: string;
  imageModel: string;
  visionModel: string;
  chatModel: string;
  stream: boolean;
  partialImages: number;
  returnBase64: boolean;
  codexCliCompatible: boolean;
  timeoutSeconds: number;
  enabled: boolean;
};
const toForm = (value: SycConfigPublic): FormState => ({
  name: value.name,
  baseUrl: value.baseUrl,
  apiKey: "",
  imageModel: value.imageModel,
  visionModel: value.visionModel,
  chatModel: value.chatModel,
  stream: value.stream,
  partialImages: value.partialImages,
  returnBase64: value.returnBase64,
  codexCliCompatible: value.codexCliCompatible,
  timeoutSeconds: value.timeoutSeconds,
  enabled: value.enabled,
});

async function requestJson(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || "操作失败");
  return data;
}

export default function SycSettingsDialog({
  config,
  onClose,
  onChanged,
}: {
  config: SycConfigPublic;
  onClose: () => void;
  onChanged: (next?: SycConfigPublic) => void | Promise<void>;
}) {
  const [form, setForm] = useState(() => toForm(config)),
    [models, setModels] = useState<string[]>([]),
    [openModelMenu, setOpenModelMenu] = useState<
      "image" | "vision" | "chat" | null
    >(null),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [testImage, setTestImage] = useState("");
  useEffect(() => {
    setForm(toForm(config));
  }, [config]);
  const draft = {
    baseUrl: form.baseUrl,
    apiKey: form.apiKey || undefined,
    imageModel: form.imageModel,
  };
  const canRequest = Boolean(
    form.baseUrl && form.imageModel && (form.apiKey || config.apiKeyConfigured),
  );
  function feedback() {
    setMessage("");
    setError("");
  }
  async function run(name: string, work: () => Promise<unknown>) {
    setBusy(name);
    feedback();
    try {
      return await work();
    } catch (value) {
      setError(value instanceof Error ? value.message : "操作失败");
    } finally {
      setBusy("");
    }
  }
  async function save() {
    await run("save", async () => {
      const next = (await requestJson(
        "/api/settings/syc",
        { ...form, apiKey: form.apiKey || undefined },
        "PUT",
      )) as SycConfigPublic;
      setForm(toForm(next));
      setMessage("SYC 配置已加密保存");
      await onChanged(next);
    });
  }
  async function fetchModels() {
    await run("models", async () => {
      const result = (await requestJson("/api/settings/syc/models", draft)) as {
        models: string[];
      };
      setModels(result.models);
      setMessage(
        `已获取 ${result.models.length} 个真实模型，仍可手动填写模型名称`,
      );
    });
  }
  function modelPicker(
    kind: "image" | "vision" | "chat",
    label: string,
    value: string,
    placeholder: string,
  ) {
    const key =
      kind === "image"
        ? "imageModel"
        : kind === "vision"
          ? "visionModel"
          : "chatModel";
    const open = openModelMenu === kind;
    return (
      <label
        className="field syc-model-field"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setOpenModelMenu(null);
        }}
      >
        {label}
        <span className="syc-model-input">
          <input
            value={value}
            onChange={(event) =>
              setForm((current) => ({ ...current, [key]: event.target.value }))
            }
            placeholder={placeholder}
          />
          <button
            type="button"
            className="syc-model-toggle"
            aria-label={`${open ? "收起" : "展开"}${label}列表`}
            aria-expanded={open}
            onClick={() =>
              setOpenModelMenu((current) => (current === kind ? null : kind))
            }
          >
            <span aria-hidden="true">⌄</span>
          </button>
        </span>
        {open && (
          <span
            className="syc-model-menu"
            role="listbox"
            aria-label={`${label}列表`}
          >
            {models.length ? (
              models.map((model) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={model === value}
                  className={model === value ? "active" : ""}
                  key={model}
                  onClick={() => {
                    setForm((current) => ({ ...current, [key]: model }));
                    setOpenModelMenu(null);
                  }}
                >
                  {model}
                </button>
              ))
            ) : (
              <small>请先点击右上角“获取模型”</small>
            )}
          </span>
        )}
      </label>
    );
  }
  async function testConnection() {
    await run("connection", async () => {
      const result = (await requestJson("/api/settings/syc/test", draft)) as {
        message: string;
        latencyMs: number;
      };
      setMessage(`${result.message} · ${result.latencyMs}ms`);
      await onChanged();
    });
  }
  async function testImageCapability() {
    if (!confirm("此操作会真实调用当前图片模型并可能产生费用，确认继续？"))
      return;
    await run("image", async () => {
      const result = (await requestJson(
        "/api/settings/syc/test-image",
        draft,
      )) as { message: string; imageUrl: string };
      setTestImage(result.imageUrl);
      setMessage(result.message);
      await onChanged();
    });
  }
  async function remove() {
    if (
      !config.apiKeyConfigured ||
      !confirm("确认删除 SYC 配置？工作流中引用它的绑定会同时清除。")
    )
      return;
    await run("delete", async () => {
      await requestJson("/api/settings/syc", undefined, "DELETE");
      await onChanged();
      onClose();
    });
  }
  function close() {
    if (!busy) onClose();
  }

  return (
    <div
      className="settings-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        className="settings-dialog syc-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="SYC 中转站 API 配置"
      >
        <header className="settings-dialog-head">
          <div>
            <small>SYC PROVIDER</small>
            <h2>SYC 中转站 API</h2>
            <p>OpenAI 兼容图片生成与图片编辑 · 完整 API Key 永不返回网页</p>
          </div>
          <button
            className="settings-dialog-close"
            aria-label="关闭配置"
            onClick={close}
          >
            ×
          </button>
        </header>
        <div className="syc-dialog-layout">
          <nav className="syc-dialog-nav" aria-label="SYC 配置分区">
            <a href="#syc-basic">API 配置</a>
            <a href="#syc-models">模型配置</a>
            <a href="#syc-advanced">高级设置</a>
            <a href="#syc-test">连接测试</a>
          </nav>
          <div className="syc-dialog-scroll">
            {(error || message) && (
              <div className={error ? "error" : "notice"}>
                {error || message}
              </div>
            )}
            <section className="syc-section" id="syc-basic">
              <div className="syc-section-title">
                <div>
                  <h3>基础配置</h3>
                  <p>配置仅保存在本机服务器的加密存储中。</p>
                </div>
                <label className="switch-row compact">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) =>
                      setForm({ ...form, enabled: e.target.checked })
                    }
                  />
                  <span>启用</span>
                </label>
              </div>
              <label className="field">
                配置名称
                <input
                  value={form.name}
                  maxLength={80}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="field">
                SYC API URL
                <input
                  value={form.baseUrl}
                  onChange={(e) =>
                    setForm({ ...form, baseUrl: e.target.value })
                  }
                  placeholder="https://ai.sycagent.top/v1"
                />
              </label>
              <label className="field">
                SYC 授权码 / API Key
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder={
                    config.apiKeyConfigured
                      ? `已配置 ${config.apiKeyMask}；留空表示不修改`
                      : "请输入自己的 SYC API Key"
                  }
                />
                <small>
                  密钥只发送到本机服务端；页面、LocalStorage
                  和日志均不保存完整内容。
                </small>
              </label>
            </section>
            <section className="syc-section" id="syc-models">
              <div className="syc-section-title">
                <div>
                  <h3>模型配置</h3>
                  <p>下拉建议来自中转站真实 /models 响应，也允许手动输入。</p>
                </div>
                <button
                  className="secondary"
                  disabled={
                    !!busy ||
                    !form.baseUrl ||
                    (!form.apiKey && !config.apiKeyConfigured)
                  }
                  onClick={() => void fetchModels()}
                >
                  {busy === "models" ? "获取中…" : "获取模型"}
                </button>
              </div>
              <div className="form-grid">
                {modelPicker(
                  "image",
                  "图片生成模型",
                  form.imageModel,
                  "用于换装、姿势和复色",
                )}
                {modelPicker(
                  "vision",
                  "图片识别模型",
                  form.visionModel,
                  "填写支持图片输入和文字输出的模型",
                )}
                {modelPicker(
                  "chat",
                  "对话模型",
                  form.chatModel,
                  "请手动填写对话模型",
                )}
              </div>
            </section>
            <section className="syc-section" id="syc-advanced">
              <div className="syc-section-title">
                <div>
                  <h3>高级设置</h3>
                  <p>保持默认值即可；流式输出需要中转站明确支持。</p>
                </div>
              </div>
              <label className="switch-row">
                <span>
                  <b>流式传输</b>
                  <small>图片工作流暂不解析 SSE 图片结果，建议保持关闭。</small>
                </span>
                <input
                  type="checkbox"
                  checked={form.stream}
                  onChange={(e) =>
                    setForm({ ...form, stream: e.target.checked })
                  }
                />
              </label>
              <label className="field">
                请求中间步骤图像数
                <select
                  value={form.partialImages}
                  disabled={!form.stream}
                  onChange={(e) =>
                    setForm({ ...form, partialImages: Number(e.target.value) })
                  }
                >
                  <option value={0}>0 张</option>
                  <option value={1}>1 张</option>
                  <option value={2}>2 张</option>
                  <option value={3}>3 张</option>
                </select>
                <small>
                  对应常见的 partial_images
                  参数；关闭流式传输时不会作为成功进度使用。
                </small>
              </label>
              <label className="switch-row">
                <span>
                  <b>返回 Base64 图片数据</b>
                  <small>
                    开启后请求 response_format:
                    b64_json，结果会验证并立即保存到本地。
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={form.returnBase64}
                  onChange={(e) =>
                    setForm({ ...form, returnBase64: e.target.checked })
                  }
                />
              </label>
              <label className="switch-row">
                <span>
                  <b>Codex CLI 兼容模式</b>
                  <small>仅在 SYC 明确要求兼容参数时开启。</small>
                </span>
                <input
                  type="checkbox"
                  checked={form.codexCliCompatible}
                  onChange={(e) =>
                    setForm({ ...form, codexCliCompatible: e.target.checked })
                  }
                />
              </label>
              <label className="field">
                请求超时（秒）
                <input
                  type="number"
                  min={10}
                  max={900}
                  value={form.timeoutSeconds}
                  onChange={(e) =>
                    setForm({ ...form, timeoutSeconds: Number(e.target.value) })
                  }
                />
              </label>
            </section>
            <section className="syc-section" id="syc-test">
              <div className="syc-section-title">
                <div>
                  <h3>连接测试</h3>
                  <p>
                    连接测试读取 /models；图片测试会真实生成并保存一张图片。
                  </p>
                </div>
              </div>
              <div className="syc-test-grid">
                <article>
                  <b>基础连接</b>
                  <span>
                    {config.lastTestStatus === "success"
                      ? "成功"
                      : config.lastTestStatus === "failed"
                        ? "失败"
                        : "未测试"}
                  </span>
                  <small>
                    {config.lastTestAt
                      ? new Date(config.lastTestAt).toLocaleString("zh-CN")
                      : "尚未测试"}
                    {config.lastTestLatencyMs
                      ? ` · ${config.lastTestLatencyMs}ms`
                      : ""}
                  </small>
                  {config.lastError && (
                    <p className="danger-text">{config.lastError}</p>
                  )}
                  <button
                    className="secondary"
                    disabled={!!busy || !canRequest}
                    onClick={() => void testConnection()}
                  >
                    {busy === "connection" ? "测试中…" : "测试连接"}
                  </button>
                </article>
                <article>
                  <b>真实图片能力</b>
                  <span>
                    {config.lastImageTestStatus === "success"
                      ? "可用"
                      : config.lastImageTestStatus === "failed"
                        ? "失败"
                        : "未测试"}
                  </span>
                  <small>
                    {config.lastImageTestAt
                      ? new Date(config.lastImageTestAt).toLocaleString("zh-CN")
                      : "会产生一次真实模型调用"}
                  </small>
                  {config.lastImageTestError && (
                    <p className="danger-text">{config.lastImageTestError}</p>
                  )}
                  {testImage && (
                    <a href={testImage} target="_blank" rel="noreferrer">
                      <img src={testImage} alt="SYC 真实测试结果" />
                    </a>
                  )}
                  <button
                    className="secondary"
                    disabled={!!busy || !canRequest}
                    onClick={() => void testImageCapability()}
                  >
                    {busy === "image" ? "生成中…" : "测试图片生成"}
                  </button>
                </article>
              </div>
            </section>
          </div>
        </div>
        <footer className="syc-dialog-footer">
          <button
            className="danger"
            disabled={!!busy || !config.apiKeyConfigured}
            onClick={() => void remove()}
          >
            删除配置
          </button>
          <span />
          <button className="secondary" disabled={!!busy} onClick={close}>
            取消
          </button>
          <button
            className="primary"
            disabled={
              !!busy ||
              !form.name ||
              !form.baseUrl ||
              !form.imageModel ||
              (!form.apiKey && !config.apiKeyConfigured)
            }
            onClick={() => void save()}
          >
            {busy === "save" ? "保存中…" : "保存配置"}
          </button>
        </footer>
      </section>
    </div>
  );
}
