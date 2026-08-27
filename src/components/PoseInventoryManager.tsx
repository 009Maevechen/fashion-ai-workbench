"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PoseInventoryGroup, PoseInventoryManifest } from "@/lib/pose-inventory";
import type { Project } from "@/lib/db";

type Recommendation = { group: PoseInventoryGroup; score: number; reasons: string[] };

const PRODUCT_TYPES = ["上衣", "裤装", "连衣裙", "半身裙", "套装"];
const SHOTS = ["全身", "半身", "上半身", "下半身"];

function inventoryUrl(group: PoseInventoryGroup, which: "cover" | "pose01" | "pose02" | "pose03"): string | undefined {
  const p = which === "cover" ? group.coverPath : which === "pose01" ? group.pose01Path : which === "pose02" ? group.pose02Path : group.pose03Path;
  return p ? `/api/pose-inventory/file?path=${encodeURIComponent(p)}` : undefined;
}

export default function PoseInventoryManager({
  initialManifest,
  projects,
}: {
  initialManifest: PoseInventoryManifest;
  projects: Project[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [manifest, setManifest] = useState(initialManifest);
  const [query, setQuery] = useState("");
  const [productType, setProductType] = useState("");
  const [shot, setShot] = useState("");
  const [face, setFace] = useState("");
  const [selected, setSelected] = useState<PoseInventoryGroup | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recommendProjectId, setRecommendProjectId] = useState(projects[0]?.id || "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [libraryPath, setLibraryPath] = useState(initialManifest.libraryDir);
  const fileInput = useRef<HTMLInputElement>(null);

  const selectMode = searchParams.get("select") === "1";
  const targetProjectId = searchParams.get("projectId");

  const groups = useMemo(
    () => {
      const filtered = manifest.groups.filter((group) => {
        if (productType && group.productType !== productType) return false;
        if (shot && group.shotType !== shot) return false;
        if (face === "露脸" && group.faceVisible !== true) return false;
        if (face === "不露脸" && group.faceVisible !== false) return false;
        return true;
      });
      if (!query.trim()) return filtered;
      const q = query.trim().toLowerCase();
      return filtered.filter((group) =>
        [group.poseGroupId, group.productType, group.productSubtype, group.tags, group.displayFocus, group.folderName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    },
    [manifest.groups, query, productType, shot, face],
  );

  async function refresh(extra?: string) {
    const url = extra ? `/api/pose-inventory?${extra}` : "/api/pose-inventory";
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setManifest(data);
    if (data.recommendations) setRecommendations(data.recommendations);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);

  async function chooseFolder() {
    setBusy("folder");
    setError("");
    try {
      const response = await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-pose-library-path", path: libraryPath }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "设置姿势库文件夹失败");
      }
      await refresh();
      setNotice("姿势库文件夹已设置，请导入表格或重新扫描");
    } catch (e) {
      setError(e instanceof Error ? e.message : "设置失败");
    } finally {
      setBusy("");
    }
  }

  async function importTable(file: File) {
    setBusy("import");
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/pose-inventory", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "导入失败");
      setManifest(data.manifest);
      const issues = data.issues || [];
      setNotice(`已导入 ${data.imported} 个姿势组${issues.length ? `；${issues.length} 条提示（缺失图片已标出）` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function rescan() {
    setBusy("scan");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/pose-inventory?action=scan", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setManifest(data);
      setNotice("已重新扫描姿势库文件夹");
    } catch (e) {
      setError(e instanceof Error ? e.message : "扫描失败");
    } finally {
      setBusy("");
    }
  }

  async function recommend() {
    if (!recommendProjectId) return;
    setBusy("recommend");
    setError("");
    try {
      const response = await fetch(`/api/pose-inventory?recommendFor=${encodeURIComponent(recommendProjectId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setManifest(data);
      setRecommendations(data.recommendations || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "推荐失败");
    } finally {
      setBusy("");
    }
  }

  function choose(group: PoseInventoryGroup) {
    if (selectMode && targetProjectId) {
      const params = new URLSearchParams();
      params.set("groupId", group.id);
      router.push(`/projects/${targetProjectId}/pose?${params.toString()}`);
    } else {
      setSelected(group);
    }
  }

  return (
    <div className="settings-stack">
      {(error || notice) && <div className={error ? "error" : "notice"}>{error || notice}</div>}

      <section className="card">
        <div className="panel-head">
          <div>
            <h2>姿势库存</h2>
            <small>图片保存在你自己的电脑文件夹，工作台只读取和建立索引</small>
          </div>
        </div>
        <div className="inventory-toolbar">
          <label className="field">
            姿势库文件夹
            <input value={libraryPath} onChange={(e) => setLibraryPath(e.target.value)} placeholder="例如 D:\\AI-Fashion-Library\\姿势库" />
          </label>
          <button className="secondary" disabled={busy === "folder"} onClick={() => void chooseFolder()}>设置文件夹</button>
          <button className="secondary" disabled={busy === "scan"} onClick={() => void rescan()}>重新扫描</button>
          <button className="primary" disabled={busy === "import"} onClick={() => fileInput.current?.click()}>
            {busy === "import" ? "导入中…" : "导入 Excel / CSV"}
          </button>
          <input ref={fileInput} type="file" accept=".csv,.xlsx,.xlsm" hidden onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importTable(file);
          }} />
        </div>
      </section>

      <section className="card">
        <div className="panel-head">
          <div>
            <h2>搜索与筛选</h2>
          </div>
        </div>
        <div className="inventory-filters">
          <label className="field">
            搜索
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="姿势组ID / 商品类型 / 标签" />
          </label>
          <label className="field">
            商品类型
            <select value={productType} onChange={(e) => setProductType(e.target.value)}>
              <option value="">全部</option>
              {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="field">
            景别
            <select value={shot} onChange={(e) => setShot(e.target.value)}>
              <option value="">全部</option>
              {SHOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">
            露脸
            <select value={face} onChange={(e) => setFace(e.target.value)}>
              <option value="">全部</option>
              <option value="露脸">露脸</option>
              <option value="不露脸">不露脸</option>
            </select>
          </label>
        </div>
      </section>

      {recommendations.length > 0 && (
        <section className="card">
          <div className="panel-head"><div><h2>推荐姿势组</h2><small>按商品类型、子类、展示重点、景别、露脸匹配</small></div>
            <div className="panel-actions">
              <label className="field">
                <select value={recommendProjectId} onChange={(e) => setRecommendProjectId(e.target.value)}>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.productType}</option>)}
                </select>
              </label>
              <button className="secondary" disabled={busy === "recommend"} onClick={() => void recommend()}>重新推荐</button>
            </div>
          </div>
          <div className="inventory-grid">
            {recommendations.map(({ group, score, reasons }) => (
              <button type="button" className="inventory-card" key={group.id} onClick={() => choose(group)}>
                <img src={inventoryUrl(group, "cover")} alt={group.poseGroupId} />
                <div className="inventory-card-body">
                  <b>{group.poseGroupId}</b>
                  <small>{group.productType}{group.productSubtype ? ` / ${group.productSubtype}` : ""}</small>
                  <span className="badge success">匹配度 {score}%</span>
                  <small>{reasons.join(" · ")}</small>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="panel-head"><div><h2>全部姿势组（{groups.length}）</h2><small>点击查看详情{selectMode ? "或直接选择" : ""}</small></div></div>
        {groups.length === 0 ? (
          <div className="empty-state"><div><div className="empty-icon">◇</div><b>还没有姿势组</b><p>先设置姿势库文件夹，再导入 Excel/CSV 表格。</p></div></div>
        ) : (
          <div className="inventory-grid">
            {groups.map((group) => (
              <button type="button" className="inventory-card" key={group.id} onClick={() => choose(group)}>
                {group.coverPath ? (
                  <img src={inventoryUrl(group, "cover")} alt={group.poseGroupId} />
                ) : (
                  <div className="inventory-no-cover">无封面</div>
                )}
                <div className="inventory-card-body">
                  <b>{group.poseGroupId}</b>
                  <small>{group.productType}{group.productSubtype ? ` / ${group.productSubtype}` : ""}</small>
                  <small>{group.shotType}{group.faceVisible !== undefined ? ` · ${group.faceVisible ? "露脸" : "不露脸"}` : ""}</small>
                  {group.displayFocus && <small>{group.displayFocus}</small>}
                  {group.tags && <small className="muted">{group.tags}</small>}
                  {group.missingImages && group.missingImages.length > 0 && (
                    <small className="danger-text">缺失：{group.missingImages.join("、")}</small>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <div className="settings-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <section className="settings-dialog" role="dialog" aria-label="姿势组详情">
            <header className="settings-dialog-head">
              <div>
                <small>POSE GROUP</small>
                <h2>{selected.poseGroupId}</h2>
                <p>{selected.productType}{selected.productSubtype ? ` / ${selected.productSubtype}` : ""}</p>
              </div>
              <button className="settings-dialog-close" aria-label="关闭" onClick={() => setSelected(null)}>×</button>
            </header>
            <div className="settings-dialog-body">
              <div className="inventory-detail-grid">
                {(["cover", "pose01", "pose02", "pose03"] as const).map((which, index) => {
                  const url = inventoryUrl(selected, which);
                  return (
                    <figure key={which}>
                      {url ? <img src={url} alt={which} /> : <div className="inventory-no-cover">缺失</div>}
                      <figcaption>{which === "cover" ? "封面" : `姿势${index}`}</figcaption>
                    </figure>
                  );
                })}
              </div>
              <div className="inventory-detail-meta">
                <p><b>姿势1：</b>{selected.pose1Description || "—"}</p>
                <p><b>姿势2：</b>{selected.pose2Description || "—"}</p>
                <p><b>姿势3：</b>{selected.pose3Description || "—"}</p>
                <p><b>景别：</b>{selected.shotType || "—"}</p>
                <p><b>露脸：</b>{selected.faceVisible === undefined ? "—" : selected.faceVisible ? "是" : "否"}</p>
                <p><b>展示重点：</b>{selected.displayFocus || "—"}</p>
                <p><b>标签：</b>{selected.tags || "—"}</p>
                <p><b>来源：</b>{selected.source || "—"}</p>
                <p><b>备注：</b>{selected.notes || "—"}</p>
                <p><b>本地路径：</b>{selected.folderRelativePath}</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
