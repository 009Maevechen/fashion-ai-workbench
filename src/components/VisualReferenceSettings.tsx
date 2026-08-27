"use client";

import { useEffect, useState } from "react";

type VisualReferenceState = {
  libraryDir?: string;
  settings?: { enabled: boolean; modelId?: string };
  stats?: { images: number; needsReview: number; poseGroups: number };
  error?: string;
};

export default function VisualReferenceSettings() {
  const [state, setState] = useState<VisualReferenceState | null>(null);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch("/api/visual-reference", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "读取失败");
    setState(data);
    setPath(data.libraryDir || "");
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);

  async function savePath() {
    setBusy("path");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-visual-reference-path", path }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "设置失败");
      }
      await refresh();
      setNotice("视觉参考图库路径已设置");
    } catch (e) {
      setError(e instanceof Error ? e.message : "设置失败");
    } finally {
      setBusy("");
    }
  }

  async function run(action: "scan" | "rebuild") {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/visual-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败");
      setState(data);
      setPath(data.libraryDir || "");
      setNotice(action === "scan" ? "已扫描并识别图库图片" : "已重新识别并重建索引");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy("");
    }
  }

  async function toggle(enabled: boolean) {
    setBusy("toggle");
    setError("");
    try {
      const response = await fetch("/api/visual-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-settings", enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "设置失败");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "设置失败");
    } finally {
      setBusy("");
    }
  }

  const stats = state?.stats;

  return (
    <section className="card storage-manager">
      <div className="panel-head">
        <div>
          <h2>视觉参考 Skill</h2>
          <small>读取本地参考图库，AI 识别分类打标签，为商品匹配参考图与三姿势模板组，输出视觉生产方案</small>
        </div>
        <div className="panel-actions">
          <label className="check-item">
            <input
              type="checkbox"
              checked={state?.settings?.enabled !== false}
              onChange={(e) => void toggle(e.target.checked)}
              disabled={busy === "toggle"}
            />
            开启
          </label>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="storage-location-editor">
        <label className="field">
          本地图库路径
          <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="例如 D:\\AI-Fashion-Reference" />
        </label>
        <button className="primary" type="button" disabled={busy === "path" || !path.trim()} onClick={() => void savePath()}>
          {busy === "path" ? "保存中…" : "保存路径"}
        </button>
      </div>

      <div className="actions" style={{ gap: 9, marginTop: 10 }}>
        <button className="secondary" disabled={busy === "scan"} onClick={() => void run("scan")}>
          {busy === "scan" ? "扫描中…" : "扫描图库"}
        </button>
        <button className="secondary" disabled={busy === "rebuild"} onClick={() => void run("rebuild")}>
          {busy === "rebuild" ? "重建中…" : "重新识别 / 重建索引"}
        </button>
      </div>

      {stats && (
        <div className="grid" style={{ marginTop: 14 }}>
          <article className="image-card">
            <h3>已识别图片</h3>
            <strong>{stats.images}</strong>
          </article>
          <article className="image-card">
            <h3>待确认</h3>
            <strong>{stats.needsReview}</strong>
          </article>
          <article className="image-card">
            <h3>姿势组</h3>
            <strong>{stats.poseGroups}</strong>
          </article>
        </div>
      )}
    </section>
  );
}
