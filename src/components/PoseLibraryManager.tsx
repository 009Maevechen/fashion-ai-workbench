"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PoseFaceMode, PoseShotType, PoseTemplateGroup, ProductType, Project } from "@/lib/db";
import ImagePreviewDialog from "./workbench/ImagePreviewDialog";

const PRODUCT_TYPES: ProductType[] = ["上衣", "裤装", "连衣裙", "半身裙", "套装"];
const SHOTS: { value: PoseShotType; label: string }[] = [
  { value: "full_body", label: "全身" },
  { value: "half_body", label: "半身" },
  { value: "upper_body", label: "上半身" },
  { value: "lower_body", label: "下半身" },
];
const FACE_LABEL: Record<PoseFaceMode, string> = {
  visible: "露脸",
  hidden: "不露脸",
  either: "不限",
};
const SHOT_LABEL = Object.fromEntries(SHOTS.map((item) => [item.value, item.label]));
type Draft = {
  name: string;
  description: string;
  productTypes: ProductType[];
  shotType: PoseShotType;
  faceMode: PoseFaceMode;
  styleTags: string;
  displayFocus: string;
  poseNames: [string, string, string];
  poseDescriptions: [string, string, string];
  images: [string, string, string];
};
const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  productTypes: ["上衣"],
  shotType: "full_body",
  faceMode: "either",
  styleTags: "电商展示",
  displayFocus: "",
  poseNames: ["正面展示", "轻微动态", "侧身展示"],
  poseDescriptions: ["自然正面站立，清楚展示商品正面", "轻微迈步或转移重心，展示服装动态", "身体轻微侧转，展示侧面轮廓"],
  images: ["", "", ""],
});

export default function PoseLibraryManager({ initialGroups, projects }: { initialGroups: PoseTemplateGroup[]; projects: Project[] }) {
  const router = useRouter(),
    [groups, setGroups] = useState(initialGroups),
    [query, setQuery] = useState(""),
    [productType, setProductType] = useState(""),
    [shot, setShot] = useState(""),
    [face, setFace] = useState(""),
    [favoriteOnly, setFavoriteOnly] = useState(false),
    [showArchived, setShowArchived] = useState(false),
    [selected, setSelected] = useState<PoseTemplateGroup | null>(null),
    [creating, setCreating] = useState(false),
    [draft, setDraft] = useState<Draft>(emptyDraft),
    [projectId, setProjectId] = useState(projects[0]?.id || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<{
      images: string[];
      index: number;
    } | null>(null);
  const filtered = useMemo(() => groups.filter((group) => (showArchived || !group.archived) && (!favoriteOnly || group.favorite) && (!productType || group.productTypes.includes(productType as ProductType)) && (!shot || group.shotType === shot) && (!face || group.faceMode === face) && `${group.name} ${group.description || ""} ${group.styleTags.join(" ")} ${group.displayFocus.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [groups, query, productType, shot, face, favoriteOnly, showArchived]);
  async function refresh() {
    const data = await fetch("/api/pose-library", { cache: "no-store" }).then((response) => response.json());
    setGroups(data);
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, options),
      data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(data?.error || "操作失败");
    return data;
  }
  async function upload(index: number, file?: File) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("poseIndex", String(index + 1));
    const data = await request("/api/pose-library/upload", {
      method: "POST",
      body: form,
    });
    setDraft((current) => ({
      ...current,
      images: current.images.map((value, itemIndex) => (itemIndex === index ? data.url : value)) as Draft["images"],
    }));
  }
  async function create() {
    if (draft.images.some((image) => !image)) throw new Error("请上传完整的3张姿势参考图");
    const data = await request("/api/pose-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        styleTags: draft.styleTags
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
        displayFocus: draft.displayFocus
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
        platformTags: [],
      }),
    });
    setNotice(data.created ? "姿势模板组已永久保存到本机软件，只有手动删除才会消失" : `检测到重复姿势，已使用现有模板“${data.group.name}”`);
    setCreating(false);
    setDraft(emptyDraft());
    await refresh();
  }
  async function toggleFavorite(group: PoseTemplateGroup) {
    await request(`/api/pose-library/${group.id}/favorite`, { method: "POST" });
    await refresh();
  }
  async function duplicate(group: PoseTemplateGroup) {
    await request(`/api/pose-library/${group.id}/duplicate`, {
      method: "POST",
    });
    setNotice("已复制模板组，图片文件会复用，不会重复占用存储");
    await refresh();
  }
  async function archive(group: PoseTemplateGroup) {
    await request(`/api/pose-library/${group.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !group.archived }),
    });
    await refresh();
  }
  async function remove(group: PoseTemplateGroup) {
    if (!confirm(`确认删除姿势模板“${group.name}”？\n文件会进入回收站；仍被其他模板使用的图片不会删除。`)) return;
    await request(`/api/pose-library/${group.id}`, { method: "DELETE" });
    setSelected(null);
    await refresh();
  }
  async function use(group: PoseTemplateGroup) {
    if (!projectId) throw new Error("请先选择商品项目");
    await request(`/api/pose-library/${group.id}/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    router.push(`/projects/${projectId}/pose`);
  }
  async function rename(group: PoseTemplateGroup) {
    const name = prompt("模板组名称", group.name);
    if (!name || name === group.name) return;
    await request(`/api/pose-library/${group.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await refresh();
  }

  return (
    <section className="pose-library-page">
      <div className="pose-library-toolbar card">
        <div className="pose-library-filters">
          <input placeholder="搜索名称、标签、展示重点" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={productType} onChange={(event) => setProductType(event.target.value)}>
            <option value="">全部商品类型</option>
            {PRODUCT_TYPES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={shot} onChange={(event) => setShot(event.target.value)}>
            <option value="">全部景别</option>
            {SHOTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={face} onChange={(event) => setFace(event.target.value)}>
            <option value="">全部露脸要求</option>
            <option value="visible">露脸</option>
            <option value="hidden">不露脸</option>
            <option value="either">不限</option>
          </select>
          <label className="check-item">
            <input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} />
            只看收藏
          </label>
          <label className="check-item">
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
            显示归档
          </label>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>
          ＋ 新建姿势模板组
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      <div className="pose-library-layout">
        <div className="pose-library-cards">
          {filtered.length ? (
            filtered.map((group) => (
              <article key={group.id} className={`pose-template-card ${group.archived ? "archived" : ""}`}>
                <div className="pose-template-card-head">
                  <div>
                    <b>{group.name}</b>
                    <small>
                      {group.productTypes.join("、")} · {SHOT_LABEL[group.shotType]} · {FACE_LABEL[group.faceMode]}
                    </small>
                  </div>
                  <button className="favorite-button" title="收藏" onClick={() => action(() => toggleFavorite(group))}>
                    {group.favorite ? "★" : "☆"}
                  </button>
                </div>
                <button
                  className="pose-template-images"
                  onClick={() =>
                    setPreview({
                      images: group.poses.map((pose) => pose.referenceImagePath),
                      index: 0,
                    })
                  }
                >
                  {group.poses.map((pose) => (
                    <span key={pose.id}>
                      <img src={pose.thumbnailPath || pose.referenceImagePath} alt={pose.name} />
                      <small>
                        {pose.poseIndex}. {pose.name}
                      </small>
                    </span>
                  ))}
                </button>
                <div className="tag-row">
                  {group.styleTags.slice(0, 4).map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="pose-template-meta">
                  <span>使用 {group.usageCount} 次</span>
                  <span>{group.archived ? "已归档" : "可用"}</span>
                </div>
                <div className="pose-template-actions">
                  <button onClick={() => setSelected(group)}>查看详情</button>
                  <button onClick={() => action(() => use(group))} disabled={group.archived || busy}>
                    用于项目
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="card empty-state">没有符合条件的姿势模板。新建时必须包含3张不同姿势参考图。</div>
          )}
        </div>
        <aside className="card pose-library-side">
          <div className="notice">
            <b>本机永久保存</b>
            <br />
            已保存的姿势库独立于商品项目。切换流程、清空项目或重启软件都不会删除，只有在姿势库详情中点击“删除”才会移入回收站。
          </div>
          <h2>用于当前项目</h2>
          <label className="field">
            商品项目
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">请选择项目</option>
              {projects.map((project) => (
                <option value={project.id} key={project.id}>
                  {project.sku} {project.productName}
                </option>
              ))}
            </select>
          </label>
          <p>选择模板后，会把三张参考图和姿势说明做成项目快照。以后修改姿势库，不会悄悄改变已使用的项目。</p>
          <hr />
          <h3>去重规则</h3>
          <ul>
            <li>文件哈希相同：直接复用</li>
            <li>视觉指纹近似：不重复存图</li>
            <li>姿势名称和说明相同：提示重复</li>
            <li>复制模板组：复用原图片文件</li>
          </ul>
        </aside>
      </div>
      {selected && (
        <div className="dialog-backdrop">
          <div className="pose-detail-dialog" role="dialog" aria-modal="true">
            <div className="panel-head">
              <div>
                <h2>{selected.name}</h2>
                <small>
                  使用 {selected.usageCount} 次 · 更新于 {new Date(selected.updatedAt).toLocaleString("zh-CN")}
                </small>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            <p>{selected.description || "暂无模板说明"}</p>
            <div className="pose-detail-images">
              {selected.poses.map((pose, index) => (
                <article key={pose.id}>
                  <button
                    className="image-button"
                    onClick={() =>
                      setPreview({
                        images: selected.poses.map((item) => item.referenceImagePath),
                        index,
                      })
                    }
                  >
                    <img src={pose.referenceImagePath} alt={pose.name} />
                  </button>
                  <h3>
                    {pose.poseIndex}. {pose.name}
                  </h3>
                  <p>{pose.description}</p>
                </article>
              ))}
            </div>
            <div className="dialog-actions wrap">
              <button onClick={() => action(() => rename(selected))}>编辑名称</button>
              <button onClick={() => action(() => toggleFavorite(selected))}>{selected.favorite ? "取消收藏" : "收藏"}</button>
              <button onClick={() => action(() => duplicate(selected))}>复制模板组</button>
              <button onClick={() => action(() => archive(selected))}>{selected.archived ? "取消归档" : "归档"}</button>
              <button className="danger-button" onClick={() => action(() => remove(selected))}>
                删除
              </button>
              <button className="primary" disabled={selected.archived} onClick={() => action(() => use(selected))}>
                用于当前项目
              </button>
            </div>
          </div>
        </div>
      )}
      {creating && (
        <div className="dialog-backdrop">
          <div className="pose-create-dialog" role="dialog" aria-modal="true">
            <div className="panel-head">
              <div>
                <h2>新建姿势模板组</h2>
                <small>一个模板组必须正好包含3张不同姿势</small>
              </div>
              <button className="icon-button" onClick={() => setCreating(false)}>
                ×
              </button>
            </div>
            <div className="pose-create-scroll">
              <div className="form-grid two">
                <label>
                  模板组名称
                  <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <label>
                  适用商品类型
                  <select
                    value={draft.productTypes[0]}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        productTypes: [event.target.value as ProductType],
                      })
                    }
                  >
                    {PRODUCT_TYPES.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  景别
                  <select
                    value={draft.shotType}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        shotType: event.target.value as PoseShotType,
                      })
                    }
                  >
                    {SHOTS.map((item) => (
                      <option value={item.value} key={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  露脸要求
                  <select
                    value={draft.faceMode}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        faceMode: event.target.value as PoseFaceMode,
                      })
                    }
                  >
                    <option value="visible">露脸</option>
                    <option value="hidden">不露脸</option>
                    <option value="either">不限</option>
                  </select>
                </label>
              </div>
              <label className="field">
                模板说明
                <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </label>
              <div className="pose-create-images">
                {[0, 1, 2].map((index) => (
                  <article key={index}>
                    <h3>姿势 {String(index + 1).padStart(2, "0")}</h3>
                    {draft.images[index] ? (
                      <img src={draft.images[index]} alt={`姿势${index + 1}`} />
                    ) : (
                      <label className="pose-file-drop">
                        ＋ 上传参考图
                        <input type="file" accept="image/*,.jpg,.jpeg,.jfif,.png,.webp,.avif,.heic,.heif,.gif,.tif,.tiff,.bmp" onChange={(event) => action(() => upload(index, event.target.files?.[0]))} />
                      </label>
                    )}
                    <label>
                      姿势名称
                      <input
                        value={draft.poseNames[index]}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            poseNames: current.poseNames.map((value, itemIndex) => (itemIndex === index ? event.target.value : value)) as Draft["poseNames"],
                          }))
                        }
                      />
                    </label>
                    <label>
                      姿势说明
                      <textarea
                        value={draft.poseDescriptions[index]}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            poseDescriptions: current.poseDescriptions.map((value, itemIndex) => (itemIndex === index ? event.target.value : value)) as Draft["poseDescriptions"],
                          }))
                        }
                      />
                    </label>
                  </article>
                ))}
              </div>
              <div className="form-grid two">
                <label>
                  风格标签（逗号分隔）
                  <input
                    value={draft.styleTags}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        styleTags: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  展示重点（逗号分隔）
                  <input value={draft.displayFocus} onChange={(event) => setDraft({ ...draft, displayFocus: event.target.value })} />
                </label>
              </div>
            </div>
            <div className="dialog-actions sticky-actions">
              <button className="secondary" onClick={() => setCreating(false)}>
                取消
              </button>
              <button className="primary" disabled={busy} onClick={() => action(create)}>
                保存模板组
              </button>
            </div>
          </div>
        </div>
      )}
      {preview && <ImagePreviewDialog {...preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
