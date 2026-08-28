"use client";

import { useEffect, useState } from "react";

type StorageInfo = {
  tempPath?: string;
  finalPath?: string;
  poseLibraryPath?: string;
  visualReferencePath?: string;
  outputsBytes?: number;
  finalBytes?: number;
  poseLibraryBytes?: number;
  visualReferenceBytes?: number;
};

const format = (value?: number) =>
  value === undefined ? "" : value > 1024 * 1024 * 1024 ? `${(value / 1024 / 1024 / 1024).toFixed(2)} GB` : value > 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`;

export default function LocalFilesMenu({
  open,
  onClose,
  sku,
}: {
  open: boolean;
  onClose: () => void;
  sku?: string;
}) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/storage", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setInfo(data))
      .catch(() => setInfo(null));
  }, [open]);

  if (!open) return null;

  async function openDir(which: "temp" | "final" | "pose" | "visual") {
    setNotice("");
    try {
      const response = await fetch("/api/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open-dir", path: which }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "打开失败");
      setNotice(`已请求打开：${data.opened}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "打开失败");
    }
  }

  const items: Array<{ key: string; label: string; path?: string; bytes?: number; action: () => void }> = [
    { key: "sku", label: "当前SKU文件夹", path: sku ? `${info?.tempPath || ""}/${sku}` : undefined, action: () => openDir("temp") },
    { key: "final", label: "最终成品目录", path: info?.finalPath, bytes: info?.finalBytes, action: () => openDir("final") },
    { key: "pose", label: "姿势库", path: info?.poseLibraryPath, bytes: info?.poseLibraryBytes, action: () => openDir("pose") },
    { key: "visual", label: "视觉参考库", path: info?.visualReferencePath, bytes: info?.visualReferenceBytes, action: () => openDir("visual") },
    { key: "temp", label: "临时目录", path: info?.tempPath, bytes: info?.outputsBytes, action: () => openDir("temp") },
  ];

  return (
    <div className="top-menu-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="top-menu-panel local-files-panel" role="dialog" aria-label="本地文件">
        <div className="top-menu-head">
          <div><b>本地文件</b><small>项目与输出目录快捷入口</small></div>
          <button className="top-menu-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>
        {notice && <div className="notice">{notice}</div>}
        <div className="local-files-list">
          {items.map((item) => (
            <button type="button" className="local-file-row" key={item.key} onClick={item.action}>
              <span className="local-file-icon">📁</span>
              <div>
                <b>{item.label}</b>
                <small>{item.path || "未设置"}</small>
                {item.bytes !== undefined && <small className="muted">{format(item.bytes)}</small>}
              </div>
            </button>
          ))}
        </div>
        {info?.outputsBytes !== undefined && (
          <div className="local-files-foot">临时文件占用：{format(info.outputsBytes)}</div>
        )}
      </aside>
    </div>
  );
}
