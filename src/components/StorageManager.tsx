"use client";
import { useEffect, useState } from "react";
type Stats = {
  outputsBytes: number;
  trashBytes: number;
  cacheBytes: number;
  outputPath: string;
  tempPath?: string;
  finalPath?: string;
  finalExplicit?: boolean;
  poseLibraryPath?: string;
  poseLibraryExplicit?: boolean;
  finalBytes?: number;
  poseLibraryBytes?: number;
  finalCount?: number;
  poseLibraryCount?: number;
};
const format = (value: number) =>
  value > 1024 * 1024 * 1024
    ? `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
    : value > 1024 * 1024
      ? `${(value / 1024 / 1024).toFixed(1)} MB`
      : `${Math.ceil(value / 1024)} KB`;

function DirectoryEditor({ label, placeholder, value, action, onRefresh }: {
  label: string; placeholder: string; value: string; action: string; onRefresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setError(""); setNotice(""); setSaving(true);
    try {
      const response = await fetch("/api/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, path: draft }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "保存失败"); }
      await onRefresh();
      setNotice("已保存并生效");
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  }
  return <div className="storage-location-editor">
    <label className="field">{label}<input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} /></label>
    <button className="primary" type="button" disabled={saving || !draft.trim() || draft === value} onClick={() => void save()}>{saving ? "正在保存…" : "保存路径"}</button>
    {error && <div className="error">{error}</div>}
    {notice && <div className="notice">{notice}</div>}
  </div>;
}

export default function StorageManager() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function refresh() {
    const response = await fetch("/api/storage", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setStats(data);
  }
  useEffect(() => { void refresh().catch((error) => setError(error.message)); }, []);
  async function empty() {
    if (!confirm("确认永久清空回收站？此操作无法恢复。")) return;
    setError("");
    try {
      const response = await fetch("/api/storage", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setStats((current) => current ? { ...current, ...data } : data);
      setNotice("回收站已清空");
    } catch (e) { setError(e instanceof Error ? e.message : "清空失败"); }
  }
  async function clearCache() {
    setError("");
    const response = await fetch("/api/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear-cache" }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "清理缓存失败");
    await refresh();
    setNotice("输出缓存已清理");
  }
  async function openDir(which: "temp" | "final" | "pose") {
    setError("");
    const response = await fetch("/api/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open-dir", path: which }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "打开失败");
    setNotice(`已请求打开目录：${data.opened}`);
  }
  return <section className="card storage-manager">
    <div className="panel-head"><div><h2>本地文件与存储目录</h2><small>长期只保存姿势参考图与最终成品图，其余均为临时文件</small></div><div className="actions"><button className="secondary" disabled={!stats?.cacheBytes} onClick={() => void clearCache()}>清理缓存</button><button className="danger" disabled={!stats?.trashBytes} onClick={empty}>清空回收站</button></div></div>
    {error && <div className="error">{error}</div>}
    {notice && <div className="notice">{notice}</div>}

    <h3 className="section-label">最终成品目录</h3>
    <DirectoryEditor label="成品保存位置" placeholder="例如 D:\\AI-Fashion-Outputs" value={stats?.finalPath || ""} action="set-final-path" onRefresh={refresh} />
    {stats?.finalPath && <div className="storage-path-row"><small className="path-text">{stats.finalPath}</small><span className="muted">{stats.finalExplicit ? "已自定义" : "默认（临时目录内）"} · {stats.finalCount ?? 0} 张成品</span><button className="secondary" onClick={() => void openDir("final")}>打开文件夹</button></div>}

    <h3 className="section-label">姿势参考库</h3>
    <DirectoryEditor label="姿势库位置" placeholder="例如 D:\\AI-Fashion-Library\\姿势库" value={stats?.poseLibraryPath || ""} action="set-pose-library-path" onRefresh={refresh} />
    {stats?.poseLibraryPath && <div className="storage-path-row"><small className="path-text">{stats.poseLibraryPath}</small><span className="muted">{stats.poseLibraryExplicit ? "已自定义" : "默认（临时目录内）"} · {stats.poseLibraryCount ?? 0} 张姿势</span><button className="secondary" onClick={() => void openDir("pose")}>打开文件夹</button></div>}

    <h3 className="section-label">临时工作目录</h3>
    <DirectoryEditor label="临时文件位置" placeholder="例如 D:\\AI-Fashion-Temp" value={stats?.tempPath || ""} action="set-output-path" onRefresh={refresh} />
    {stats?.tempPath && <div className="storage-path-row"><small className="path-text">{stats.tempPath}</small><button className="secondary" onClick={() => void openDir("temp")}>打开文件夹</button></div>}

    <div className="grid">
      <article className="image-card"><h3>临时文件占用</h3><strong>{stats ? format(stats.outputsBytes) : "读取中…"}</strong></article>
      <article className="image-card"><h3>最终成品占用</h3><strong>{stats ? format(stats.finalBytes || 0) : "读取中…"}</strong></article>
      <article className="image-card"><h3>姿势库占用</h3><strong>{stats ? format(stats.poseLibraryBytes || 0) : "读取中…"}</strong></article>
      <article className="image-card"><h3>回收站占用</h3><strong>{stats ? format(stats.trashBytes) : "读取中…"}</strong></article>
    </div>
  </section>;
}
