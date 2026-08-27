"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VisualReferenceManifest, VisualReferenceImage } from "@/lib/visual-reference";
import type { Project } from "@/lib/db";
import type { VisualProductionPlan } from "@/lib/visual-production-plan";

function imageUrl(relativePath?: string): string | undefined {
  return relativePath ? `/api/visual-reference/file?path=${encodeURIComponent(relativePath)}` : undefined;
}

export default function VisualReferenceManager({
  initialManifest,
  projects,
  initialSettings,
}: {
  initialManifest: VisualReferenceManifest;
  projects: Project[];
  initialSettings: { enabled: boolean; modelId?: string };
}) {
  const router = useRouter();
  const [manifest, setManifest] = useState(initialManifest);
  const [query, setQuery] = useState("");
  const [productType, setProductType] = useState("");
  const [plan, setPlan] = useState<VisualProductionPlan | null>(null);
  const [planProjectId, setPlanProjectId] = useState(projects[0]?.id || "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return manifest.poseGroups.filter((group) => {
      if (productType && group.productType !== productType) return false;
      if (!q) return true;
      return [group.poseGroupId, group.productType, group.productSubtype, group.tags, group.displayFocus, group.folderName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [manifest.poseGroups, query, productType]);

  const reviewImages = useMemo(() => manifest.images.filter((image) => image.needsReview), [manifest.images]);

  async function runScan(action: "scan" | "rebuild") {
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
      setManifest(data);
      setNotice(action === "scan" ? "已扫描并识别图库" : "已重新识别并重建索引");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy("");
    }
  }

  async function generatePlan() {
    if (!planProjectId) return;
    setBusy("plan");
    setError("");
    try {
      const response = await fetch(`/api/projects/${planProjectId}/visual-plan`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成方案失败");
      setPlan(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成方案失败");
    } finally {
      setBusy("");
    }
  }

  function usePlan() {
    if (!plan?.recommendedPoseGroup || !planProjectId) return;
    router.push(`/inventory/poses?select=1&projectId=${planProjectId}`);
  }

  return (
    <div className="settings-stack">
      {(error || notice) && <div className={error ? "error" : "notice"}>{error || notice}</div>}

      <section className="card">
        <div className="panel-head">
          <div>
            <h2>视觉参考 Skill{initialSettings.enabled === false ? "（已关闭）" : ""}</h2>
            <small>图库已识别 {manifest.images.length} 张图，{manifest.poseGroups.length} 个姿势组，{reviewImages.length} 张待确认</small>
          </div>
          <div className="panel-actions">
            <button className="secondary" disabled={busy === "scan"} onClick={() => void runScan("scan")}>扫描图库</button>
            <button className="secondary" disabled={busy === "rebuild"} onClick={() => void runScan("rebuild")}>重新识别</button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="panel-head"><div><h2>为当前商品生成视觉生产方案</h2><small>上传商品图后自动识别，推荐最合适的参考图与三姿势模板组</small></div></div>
        <div className="inventory-toolbar">
          <label className="field">
            商品项目
            <select value={planProjectId} onChange={(e) => setPlanProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.productName} · {p.productType}</option>)}
            </select>
          </label>
          <button className="primary" disabled={busy === "plan" || !planProjectId} onClick={() => void generatePlan()}>
            {busy === "plan" ? "生成中…" : "生成视觉生产方案"}
          </button>
        </div>

        {plan && (
          <div className="plan-result" style={{ marginTop: 16 }}>
            <div className="plan-head">
              <div>
                <b>商品识别：{plan.product.productType}{plan.product.productSubtype ? ` / ${plan.product.productSubtype}` : ""}</b>
                <small>推荐景别：{plan.recommendedShot} · 推荐{plan.recommendedFace ? "露脸" : "不露脸"}</small>
              </div>
              <button className="primary" onClick={usePlan}>使用此方案 →</button>
            </div>
            {plan.recommendedPoseGroup && (
              <div className="plan-pose">
                <b>推荐姿势组：{plan.recommendedPoseGroup.poseGroupId}</b>
                <div className="inventory-detail-grid">
                  {([plan.poseImages[0], plan.poseImages[1], plan.poseImages[2]] as (string | undefined)[]).map((img, i) => (
                    <figure key={i}>{img ? <img src={imageUrl(img)} alt={`姿势${i + 1}`} /> : <div className="inventory-no-cover">缺图</div>}<figcaption>姿势{i + 1}</figcaption></figure>
                  ))}
                </div>
              </div>
            )}
            {plan.risks.length > 0 && (
              <div className="notice">
                {plan.risks.map((risk, i) => <div key={i}>⚠ {risk}</div>)}
              </div>
            )}
            <details>
              <summary>查看最终 Prompt（可复制）</summary>
              <pre className="plan-prompt">{plan.prompt}</pre>
            </details>
          </div>
        )}
      </section>

      <section className="card">
        <div className="panel-head">
          <div><h2>姿势组（{groups.length}）</h2><small>点击查看三张姿势参考图</small></div>
          <div className="panel-actions">
            <input className="library-search" placeholder="搜索姿势组/类型/标签" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select value={productType} onChange={(e) => setProductType(e.target.value)}>
              <option value="">全部类型</option>
              {["上衣", "裤装", "连衣裙", "半身裙", "套装"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        {groups.length === 0 ? (
          <div className="empty-state"><div><div className="empty-icon">◇</div><b>还没有姿势组</b><p>在设置页配置图库路径后点击「扫描图库」。</p></div></div>
        ) : (
          <div className="inventory-grid">
            {groups.map((group) => (
              <button type="button" className="inventory-card" key={group.id} onClick={() => router.push(`/inventory/poses?groupId=${group.id}`)}>
                <div className="inventory-card-preview">
                  {([group.pose01Path, group.pose02Path, group.pose03Path] as (string | undefined)[]).map((img, i) => {
                    const url = img ? imageUrl(img) : imageUrl(group.coverPath);
                    return url ? <img key={i} src={url} alt={`姿势${i + 1}`} /> : <span key={i}>姿势{i + 1}</span>;
                  })}
                </div>
                <div className="inventory-card-body">
                  <b>{group.poseGroupId}</b>
                  <small>{group.productType}{group.productSubtype ? ` / ${group.productSubtype}` : ""}</small>
                  <small>{group.shotType}{group.faceVisible !== undefined ? ` · ${group.faceVisible ? "露脸" : "不露脸"}` : ""}</small>
                  {group.needsReview && <small className="danger-text">待确认</small>}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {reviewImages.length > 0 && (
        <section className="card">
          <div className="panel-head"><div><h2>待确认图片（{reviewImages.length}）</h2><small>识别置信度较低，需要人工复核标签</small></div></div>
          <div className="inventory-grid">
            {reviewImages.slice(0, 20).map((image: VisualReferenceImage) => (
              <div className="inventory-card" key={image.id}>
                {imageUrl(image.relativePath) ? <img src={imageUrl(image.relativePath)} alt={image.fileName} /> : <div className="inventory-no-cover">无图</div>}
                <div className="inventory-card-body">
                  <small>{image.fileName}</small>
                  <small className="muted">路径：{image.relativePath}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
