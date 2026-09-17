"use client";

import { useRef, useState } from "react";
import type { TargetColor } from "@/lib/db";
import { thumbnailUrl } from "@/lib/image-url";
import type { Runner } from "./types";

// 每个颜色款只启用一张当前参考图；旧图保留为历史记录但绝不参与分析或生成。
export default function ColorVariantReferences({
  projectId,
  colors,
  activeId,
  busy,
  run,
  refreshProject,
  onSelectColor,
  onRemoveColor,
  onPreview,
}: {
  projectId: string;
  colors: TargetColor[];
  activeId: string;
  busy: boolean;
  run: Runner;
  refreshProject: () => Promise<void>;
  onSelectColor: (id: string) => void;
  onRemoveColor: (id: string) => Promise<void>;
  onPreview: (url: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [targetColorId, setTargetColorId] = useState("");
  const [replaceImageId, setReplaceImageId] = useState("");
  const [addingName, setAddingName] = useState("");
  const [addingOpen, setAddingOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function pickAndUpload(colorId: string, replaceId?: string) {
    setTargetColorId(colorId);
    setReplaceImageId(replaceId || "");
    fileInput.current?.click();
  }
  async function onFile(file: File | undefined) {
    const colorId = targetColorId;
    const replaceId = replaceImageId;
    setTargetColorId("");
    setReplaceImageId("");
    if (!file || !colorId) return;
    const form = new FormData();
    form.set("file", file);
    if (replaceId) form.set("replaceImageId", replaceId);
    const response = await fetch(
      `/api/projects/${projectId}/colors/${colorId}/references`,
      { method: "POST", body: form },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "上传参考图失败");
    await refreshProject();
    // 上传后自动识别该颜色款参考图的主色/HEX，避免使用占位色导致复色偏色；分析失败不阻断上传。
    try {
      await analyze(colorId);
    } catch {
      /* 忽略自动分析失败，用户可手动点「分析颜色」 */
    }
  }
  async function deleteImage(colorId: string, imageId: string) {
    const response = await fetch(
      `/api/projects/${projectId}/colors/${colorId}/references/${imageId}`,
      { method: "DELETE" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "删除参考图失败");
    await refreshProject();
  }
  async function setPrimary(colorId: string, imageId: string) {
    const response = await fetch(
      `/api/projects/${projectId}/colors/${colorId}/references/${imageId}/primary`,
      { method: "POST" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "设置主参考图失败");
    await refreshProject();
    await analyze(colorId, true);
  }
  async function analyze(colorId: string, force = false) {
    const response = await fetch(
      `/api/projects/${projectId}/colors/${colorId}/analyze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "颜色款分析失败");
    await refreshProject();
    return data as { needsReview?: boolean; conflicts?: string[] };
  }

  return (
    <div className="color-variant-references">
      <div className="recolor-section-title">
        <div>
          <h3>每款颜色独立参考图</h3>
          <small>
            最新主参考图是唯一颜色标准；历史图保留查看，但不会参与生成
          </small>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setAddingOpen((v) => !v)}
        >
          ＋ 新增颜色
        </button>
      </div>
      {addingOpen && (
        <div className="color-variant-add">
          <input
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            placeholder="输入颜色名称，例如 酒红色"
          />
          <button
            type="button"
            className="primary"
            disabled={busy || !addingName.trim()}
            onClick={() =>
              run(async () => {
                const name = addingName.trim();
                setAddingName("");
                setAddingOpen(false);
                const response = await fetch(
                  `/api/projects/${projectId}/colors`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name }),
                  },
                );
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || "新增颜色失败");
                onSelectColor(data.colorId);
                await refreshProject();
              })
            }
          >
            确认新增
          </button>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void run(() => onFile(file));
        }}
      />
      {colors.length ? (
        <div className="color-variant-list">
          {colors.map((color) => {
            const refs = color.referenceImages || [];
            const expanded = expandedIds.has(color.id);
            return (
              <div
                key={color.id}
                className={`color-variant-item ${color.id === activeId ? "active" : ""}`}
              >
                <div className="color-variant-head">
                  <button
                    type="button"
                    className="color-variant-toggle"
                    onClick={() => {
                      onSelectColor(color.id);
                      toggleExpand(color.id);
                    }}
                  >
                    <span className="color-variant-arrow">
                      {expanded ? "▼" : "▶"}
                    </span>
                    <span className="color-variant-name">
                      {color.userConfirmedName || color.name || "未命名颜色"}
                    </span>
                    {color.referenceNeedsReview && (
                      <span className="badge failed">需人工确认</span>
                    )}
                    <small className="color-variant-count">
                      {refs.length
                        ? `1 张生效${refs.length > 1 ? ` · ${refs.length - 1} 张历史` : ""}`
                        : color.cropImage
                          ? "无独立图 · 使用共享参考图"
                          : "无独立图 · 按当前参考资料复色"}
                    </small>
                  </button>
                  <div className="color-variant-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => run(() => analyze(color.id))}
                    >
                      分析颜色
                    </button>
                    <button
                      type="button"
                      className="danger text-button"
                      disabled={busy}
                      onClick={() => run(() => onRemoveColor(color.id))}
                    >
                      删除颜色款
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="color-variant-refs">
                    {refs.map((img) => (
                      <div
                        key={img.id}
                        className={`color-variant-ref ${img.isPrimary ? "primary" : ""}`}
                      >
                        <button
                          type="button"
                          className="color-variant-thumb"
                          title="查看高清原图"
                          onClick={() => img.path && onPreview(img.path)}
                        >
                          <img
                            src={thumbnailUrl(img.thumbnailPath || img.previewPath || img.path, 160)}
                            alt={img.fileName || "参考图"}
                          />
                          {img.isPrimary && <span>主参考图</span>}
                          {!img.isPrimary && <span>历史图 · 不参与</span>}
                        </button>
                        <div className="color-variant-ref-actions">
                          {!img.isPrimary && (
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy}
                              onClick={() => run(() => setPrimary(color.id, img.id))}
                            >
                              设为主图
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-button"
                            disabled={busy}
                            onClick={() => pickAndUpload(color.id, img.id)}
                          >
                            替换
                          </button>
                          <button
                            type="button"
                            className="danger text-button"
                            disabled={busy}
                            onClick={() =>
                              run(() => deleteImage(color.id, img.id))
                            }
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="color-variant-upload"
                      disabled={busy}
                      onClick={() => pickAndUpload(color.id)}
                    >
                      ＋ 上传新的唯一参考图
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state compact-empty">还没有颜色款，点击「新增颜色」开始。</div>
      )}
    </div>
  );
}
