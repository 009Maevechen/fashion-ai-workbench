"use client";

import { useMemo, useState } from "react";
import type { PanelProps } from "./types";
import type { GarmentDetailLock, ProductType } from "@/lib/db";
import AssetUploadCard, { type LocalAsset } from "./AssetUploadCard";
import ImagePreviewDialog from "./ImagePreviewDialog";
import ResultCard from "./ResultCard";
import { useInpaint } from "./useInpaint";
import ConsistencyCheck from "./ConsistencyCheck";
import ClearAssetsButton from "./ClearAssetsButton";
import ClearResultsButton from "./ClearResultsButton";
import { hasClearableSourceAssets } from "@/lib/asset-cleanup";
import { hasWorkflowResults } from "@/lib/result-cleanup";
import { buildProductProtectionPrompt } from "@/lib/product-structure";
import {
  TRYON_MODE_OPTIONS,
  TRYON_PRODUCT_TYPE_OPTIONS,
  TRYON_PROTECTION_LABELS,
  TRYON_PROTECTION_OPTIONS,
} from "@/lib/tryon-options";
import { canConfirmTryonSelection } from "@/lib/tryon-confirmation";
import { useProjectDraftAutosave } from "./useProjectDraftAutosave";
import { composeTryonDetailRequirements } from "@/lib/tryon-detail-requirements";
import { thumbnailUrl } from "@/lib/image-url";
import type { Job } from "@/lib/db";
import ColorCropper, { type CropRegion } from "./ColorCropper";
import GenerationControls from "./GenerationControls";

const DETAILS =
  "保持服装领口、袖口、肩部、下摆、纽扣数量、印花位置、白色包边、面料纹理和服装长度，不得增加或删除口袋、腰带、纽扣、印花或装饰。";

export default function TryonPanel({
  p,
  jobs,
  historyJobs,
  health,
  modelRouting,
  busy,
  run,
  persistAsset,
  deleteAsset,
  clearSourceAssets,
  clearWorkflowResults,
  cancelGeneration,
  clearWorkflowErrors,
  saveProject,
  post,
  confirmFlow,
}: PanelProps & { historyJobs: Job[] }) {
  const saved = p.settings.tryon;
  const [garment, setGarment] = useState<LocalAsset>({
    url: p.assets.garmentImage,
    name: "已保存服装图",
    status: p.assets.garmentImage ? "saved" : "idle",
  });
  const [model, setModel] = useState<LocalAsset>({
    url: p.assets.modelReferenceImage || p.assets.modelImage,
    name: "已保存模特图",
    status:
      p.assets.modelReferenceImage || p.assets.modelImage ? "saved" : "idle",
  });
  const [description, setDescription] = useState(
    saved?.garmentDescription || "",
  );
  const [productType, setProductType] = useState<ProductType | "">(
    saved?.productType || p.productType || "",
  );
  const [extra, setExtra] = useState(() => {
    const value =
      saved?.extraRequirements ||
      (saved?.detailRequirements && saved.detailRequirements.length <= 800
        ? saved.detailRequirements
        : DETAILS);
    return value.length > 800 ? value.slice(0, 800) : value;
  });
  const [mode, setMode] = useState<"fast" | "standard" | "quality">(
    saved?.mode || "standard",
  );
  const [face, setFace] = useState(saved?.face ?? false);
  const [count, setCount] = useState(saved?.candidateCount || 2);
  const [selected, setSelected] = useState(
    p.confirmedTryonImage || saved?.selectedCandidateImage || "",
  );
  const [candidateSlot, setCandidateSlot] = useState(
    saved?.activeCandidateSlot || 1,
  );
  const [protectedItems, setProtected] = useState(
    saved?.protectedItems?.length
      ? saved.protectedItems
      : [
          ...new Set([
            ...TRYON_PROTECTION_LABELS,
            ...(p.profile?.protectionItems || []),
          ]),
        ],
  );
  const [preview, setPreview] = useState<{
    images: string[];
    index: number;
  } | null>(null);
  const [historyJobId, setHistoryJobId] = useState("");
  const [garmentCropUrl, setGarmentCropUrl] = useState(
    p.assets.garmentCropImage || "",
  );
  const [garmentCropRegion, setGarmentCropRegion] = useState<
    CropRegion | undefined
  >(p.assets.garmentCropRegion);
  const [garmentCropOpen, setGarmentCropOpen] = useState(false),
    [garmentCropDraft, setGarmentCropDraft] = useState<CropRegion | undefined>(
      p.assets.garmentCropRegion,
    );
  const [detailLock, setDetailLock] = useState<GarmentDetailLock | null>(
    p.garmentDetailLock || null,
  );
  const route = modelRouting.tryon,
    routed = route.primary.source === "stored";
  const standardProvider = routed
    ? route.primary.model
    : health.tryonProvider === "custom"
      ? "自定义模型"
      : health.tryonProvider === "volcengine"
        ? "Seedream 5.0"
        : "BFL VTO";
  const configured = routed
    ? route.primary.configured
    : health.tryonProvider === "custom"
      ? health.custom
      : mode === "quality"
        ? health.fashn
        : health.tryonProvider === "volcengine"
          ? health.volcengine
          : health.bfl;
  const modelName = routed
    ? route.primary.model
    : health.tryonProvider === "custom"
      ? "自定义图像 API"
      : mode === "quality"
        ? "FASHN Try-On Max"
        : health.tryonProvider === "volcengine"
          ? "Doubao Seedream 5.0"
          : "BFL FLUX Virtual Try-On";
  const historyItems = historyJobs.filter(
    (job) =>
      job.outputImages[0] &&
      job.status !== "interrupted",
  );
  const allImages = [
    ...new Set(
      [
        garment.url,
        model.url,
        ...historyItems.flatMap((j) => j.outputImages),
      ].filter(Boolean),
    ),
  ] as string[];
  const structurePrompt = buildProductProtectionPrompt(
      productType || p.productType,
      p.profile,
    ),
    missing = [!garment.url && "服装产品图", !model.url && "模特参考图"].filter(
      Boolean,
    ) as string[];
  const canConfirmSelected = canConfirmTryonSelection(selected, historyJobs);
  const selectedJob = historyJobs.find((job) =>
    job.outputImages.includes(selected),
  );
  const confirmHint = !selected
    ? "请先在上方候选图中点击「选择此结果」"
    : !selectedJob
      ? "所选结果已不在当前任务中，请重新生成"
      : selectedJob.status === "needs_redo"
        ? "AI 检测到服装细节可能不一致；请人工审核。若你确认可用，仍可继续"
        : selectedJob.status === "failed"
          ? "AI 主体或细节质检未通过；图片已保存，人工审核可用后仍可确认"
          : selectedJob.status === "interrupted"
            ? "该结果生成被中断，请重新生成"
            : selectedJob.status === "stale" ||
                selectedJob.dependencyStatus === "stale"
              ? "该结果已过期，请重新生成"
              : "确认后可进入三种姿势";
  const candidateTotal = Math.max(count, jobs.length, 1),
    activeCandidate = Math.min(candidateSlot, candidateTotal),
    historyJob = historyItems.find((job) => job.id === historyJobId),
    visibleJob = historyJob || jobs.find((job) => job.slot === activeCandidate),
    visibleUrl = visibleJob?.outputImages[0];
  const activeTryonJob = historyJobs.find(
      (job) =>
        job.workflow === "tryon" &&
        [
          "queued",
          "uploading",
          "submitting",
          "waiting_provider",
          "downloading",
          "validating",
          "optimizing",
          "saving",
          "generating",
        ].includes(job.phase || job.status),
    ),
    busyLabel = activeTryonJob
      ? activeTryonJob.phase === "validating"
        ? "视觉质检中…"
        : activeTryonJob.phase === "waiting_provider"
          ? "模型出图中…"
          : activeTryonJob.phase === "saving" ||
              activeTryonJob.phase === "optimizing" ||
              activeTryonJob.phase === "downloading"
            ? "结果处理中…"
            : "准备生成中…"
      : "准备识别中…";
  const draftSettings = useMemo(
    () => ({
      settings: {
        ...p.settings,
        tryon: {
          ...saved,
          mode,
          candidateCount: count,
          productType: productType || p.productType,
          garmentDescription: description,
          detailRequirements: extra,
          extraRequirements: extra,
          protectedItems,
          face,
          selectedCandidateImage: selected || undefined,
          activeCandidateSlot: candidateSlot,
        },
      },
    }),
    [
      candidateSlot,
      count,
      description,
      extra,
      face,
      mode,
      p.productType,
      p.settings,
      productType,
      protectedItems,
      saved,
      selected,
    ],
  );
  useProjectDraftAutosave(p.id, draftSettings);

  async function saveAsset(
    asset: LocalAsset,
    key: "garmentImage" | "modelReferenceImage",
    name: string,
    setter: (asset: LocalAsset) => void,
  ) {
    setter({ ...asset, status: "uploading" });
    try {
      const url = await persistAsset(asset.file, key, name);
      setter({ ...asset, url, file: undefined, status: "saved" });
      if (key === "garmentImage") {
        setDetailLock(null);
        setGarmentCropUrl("");
        setGarmentCropRegion(undefined);
        setGarmentCropDraft(undefined);
        await fetch(`/api/projects/${p.id}/tryon-garment-crop`, {
          method: "DELETE",
        });
      }
    } catch (error) {
      setter({
        ...asset,
        status: "failed",
        error: error instanceof Error ? error.message : "上传失败",
      });
      throw error;
    }
  }
  async function saveSettings() {
    if (!productType) throw new Error("请先选择服装类型");
    await saveProject({ productType, ...draftSettings });
  }
  async function clearAllAssets() {
    await clearSourceAssets();
    setGarment({ status: "idle" });
    setModel({ status: "idle" });
    setDetailLock(null);
    setPreview(null);
  }
  async function saveGarmentCrop() {
    if (!garment.url || !garmentCropDraft)
      throw new Error("请先框选完整的整套服装区域");
    const result = (await post(`/api/projects/${p.id}/tryon-garment-crop`, {
      region: garmentCropDraft,
    })) as { url: string; region: CropRegion };
    setGarmentCropUrl(result.url);
    setGarmentCropRegion(result.region);
    setGarmentCropOpen(false);
    setDetailLock(null);
  }
  async function refreshDetailLock() {
    if (!garment.url) throw new Error("请先上传并保存服装产品图");
    const result = (await post(
      `/api/projects/${p.id}/garment-detail-lock`,
      {},
    )) as { lock: GarmentDetailLock };
    setDetailLock(result.lock);
  }
  async function clearResults() {
    await clearWorkflowResults("tryon");
    setSelected("");
    setHistoryJobId("");
    setPreview(null);
  }
  async function start(
    slot?: number,
    modelPreference: "primary" | "fallback" = "primary",
  ) {
    if (!productType) throw new Error("请先选择服装类型");
    if (!garment.url || !model.url)
      throw new Error("两张图片必须保存成功后才能生成");
    await saveSettings();
    await post("/api/tryon", {
      projectId: p.id,
      productType,
      garmentImage: garmentCropUrl || garment.url,
      modelImage: model.url,
      garmentDescription: description,
      detailRequirements: composeTryonDetailRequirements(
        structurePrompt,
        `${protectedItems.join("；")}。${garmentCropUrl ? "只使用用户框选的整套服装区域" : ""}`,
        extra,
      ),
      extraRequirements: extra,
      face,
      mode,
      candidateCount: slot ? 1 : count,
      modelPreference,
      ...(slot ? { slot } : {}),
    });
  }
  async function checkConsistency(jobId: string) {
    await post(`/api/projects/${p.id}/consistency-check`, { jobId });
  }
  const inpaint = useInpaint({ project: p, sourceStep: "tryon", submit: post });

  return (
    <>
      <div className="workbench-grid">
        <section className="card workbench-panel tryon-input-panel">
          <div className="panel-head">
            <h2>输入素材</h2>
            <div className="panel-actions">
              <small>选择后立即保存</small>
              <ClearAssetsButton
                disabled={busy || !hasClearableSourceAssets(p)}
                onConfirm={clearAllAssets}
              />
            </div>
          </div>
          <label className="field">
            <b>第一步：先选择服装类型</b>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value as ProductType)}
              required
            >
              <option value="" disabled>
                请选择服装类型
              </option>
              {TRYON_PRODUCT_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>生成时将严格按照所选服装类目处理。</small>
          </label>
          <div className="upload-pair">
            <AssetUploadCard
              label="服装产品图"
              description="上传真实服装产品图"
              value={garment}
              onChange={(a) =>
                run(() => saveAsset(a, "garmentImage", "garment", setGarment))
              }
              onDelete={() =>
                run(async () => {
                  await deleteAsset("garmentImage");
                  setGarment({ status: "idle" });
                  setDetailLock(null);
                })
              }
              onPreview={() =>
                garment.url &&
                setPreview({
                  images: allImages,
                  index: allImages.indexOf(garment.url),
                })
              }
            />
            <AssetUploadCard
              label="模特参考图"
              description="只参考姿势、场景和背景，不参考模特服装"
              value={model}
              onChange={(a) =>
                run(() =>
                  saveAsset(
                    a,
                    "modelReferenceImage",
                    "model-reference",
                    setModel,
                  ),
                )
              }
              onDelete={() =>
                run(async () => {
                  await deleteAsset("modelReferenceImage");
                  setModel({ status: "idle" });
                })
              }
              onPreview={() =>
                model.url &&
                setPreview({
                  images: allImages,
                  index: allImages.indexOf(model.url),
                })
              }
            />
          </div>
          <div className="tryon-garment-crop-control">
            <div className="panel-head">
              <div>
                <h3>手动框选整套服装区域</h3>
                <small>
                  产品图含多件或多个颜色款时，只框选其中一件完整服装；换装禁止混合其他颜色款。
                </small>
              </div>
              <button
                type="button"
                className="secondary"
                disabled={!garment.url || busy}
                onClick={() => {
                  setGarmentCropDraft(garmentCropRegion);
                  setGarmentCropOpen(true);
                }}
              >
                {garmentCropUrl ? "重新框选服装" : "开始框选服装"}
              </button>
            </div>
            {garmentCropUrl ? (
              <div className="notice">
                已锁定用户框选的单件服装；框外其他颜色款、人物、背景和文字全部忽略。
              </div>
            ) : (
              <div className="notice warning">
                若产品图同时有多件或多色，请先框选其中一件。未框选时系统也只允许选择最大、最完整、最清晰的一件，禁止跨颜色款混合。
              </div>
            )}
          </div>
          <section
            className="tryon-garment-crop-control"
            aria-label="服装细节锁定层"
          >
            <div className="panel-head">
              <div>
                <h3>服装细节锁定层</h3>
                <small>
                  生成前会自动读取产品主图及纽扣、口袋、面料、印花、领口、袖口、下摆、车线特写，逐项锁定结构。
                </small>
              </div>
              <button
                type="button"
                className="secondary"
                disabled={!garment.url || busy}
                onClick={() => run(refreshDetailLock)}
              >
                {detailLock ? "重新识别细节锁" : "识别并锁定细节"}
              </button>
            </div>
            {detailLock ? (
              <div
                className={`notice ${detailLock.status === "needs_review" ? "warning" : ""}`}
              >
                <b>
                  {detailLock.status === "locked"
                    ? "细节锁已建立"
                    : "细节锁已建立，部分项目需人工确认"}
                </b>{" "}
                · 已锁定{" "}
                {
                  Object.values(detailLock.fields).filter(
                    (field) => field.visibility === "visible",
                  ).length
                }{" "}
                项 · 细节参考 {detailLock.detailReferences.length} 张
                {detailLock.model
                  ? ` · ${detailLock.model}`
                  : " · 人工确认资料"}
              </div>
            ) : (
              <div className="notice">
                尚未建立；点击开始换装时服务端会先自动建立，失败时不会调用生图模型。
              </div>
            )}
          </section>
          {garmentCropOpen && garment.url && (
            <div className="reference-crop-dialog-backdrop">
              <section
                className="reference-crop-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="框选整套服装区域"
              >
                <div className="panel-head">
                  <div>
                    <h2>框选要用于换装的一件完整服装</h2>
                    <small>
                      多件或多色产品图只选其中一件；不要把第二件服装或其他颜色款框进来。
                    </small>
                  </div>
                  <button
                    type="button"
                    className="settings-dialog-close compact-close"
                    onClick={() => setGarmentCropOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <ColorCropper
                  src={garment.url}
                  region={garmentCropDraft}
                  onChange={setGarmentCropDraft}
                  label="服装产品图中的单件服装选择区域"
                />
                <div className="reference-crop-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setGarmentCropOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={!garmentCropDraft || busy}
                    onClick={() => run(saveGarmentCrop)}
                  >
                    保存这一件服装
                  </button>
                </div>
              </section>
            </div>
          )}
          <section
            className="tryon-generation-history"
            aria-labelledby="tryon-generation-history-title"
          >
            <div className="tryon-history-head">
              <div>
                <h3 id="tryon-generation-history-title">生成历史</h3>
                <small>点击小图回到之前生成的照片</small>
              </div>
              <span>{historyItems.length} 张</span>
            </div>
            {historyItems.length ? (
              <div className="tryon-history-grid">
                {historyItems.map((job, index) => {
                  const url = job.outputImages[0],
                    active = job.id === historyJobId;
                  return (
                    <button
                      type="button"
                      className={active ? "active" : ""}
                      key={job.id}
                      onClick={() => {
                        setHistoryJobId(job.id);
                        setCandidateSlot(job.slot || 1);
                      }}
                      title={`查看 ${new Date(job.startedAt).toLocaleString("zh-CN")}`}
                      aria-label={`查看历史生成图 ${index + 1}`}
                    >
                      <img
                        src={thumbnailUrl(url)}
                        alt={`历史生成图 ${index + 1}`}
                      />
                      <span>
                        {new Date(job.startedAt).toLocaleDateString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="tryon-history-empty">
                生成过的换装照片会保存在这里
              </div>
            )}
          </section>
          {missing.length > 0 && (
            <div className="notice">
              开始换装前还需要保存：{missing.join("、")}。
            </div>
          )}
          <label className="field">
            服装描述
            <textarea
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <span className="field-count">{description.length}/500</span>
          </label>
          <label className="field tryon-detail-field">
            重点细节要求
            <small>
              产品图识别出的版型、面料、纹理、领口、袖口、包边、拼接、色块和装饰会由服务端自动叠加；这里可继续补充或修正。
            </small>
            <textarea
              maxLength={800}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
            <span className="field-count">{extra.length}/800</span>
          </label>
          <button className="secondary" onClick={() => run(saveSettings)}>
            保存换装设置
          </button>
        </section>
        <section className="card workbench-panel tryon-results-panel">
          <div className="panel-head">
            <h2>换装结果（候选图）</h2>
            <div className="panel-actions">
              <div className="tryon-candidate-tabs">
                {Array.from(
                  { length: candidateTotal },
                  (_, index) => index + 1,
                ).map((slot) => (
                  <button
                    type="button"
                    className={
                      !historyJob && activeCandidate === slot ? "active" : ""
                    }
                    key={slot}
                    onClick={() => {
                      setHistoryJobId("");
                      setCandidateSlot(slot);
                    }}
                  >
                    候选{String(slot).padStart(2, "0")}
                  </button>
                ))}
              </div>
              <ClearResultsButton
                workflow="tryon"
                disabled={busy || !hasWorkflowResults(p, jobs, "tryon")}
                onConfirm={clearResults}
              />
            </div>
          </div>
          <div className="tryon-result-layout">
            {visibleJob ? (
              <div className="result-grid tryon-single-result">
                <div>
                  <ResultCard
                    key={`tryon-result-${visibleJob.id}`}
                    job={visibleJob}
                    label={
                      historyJob
                        ? `历史生成 · 候选 ${String(visibleJob.slot || 1).padStart(2, "0")}`
                        : `候选 ${String(activeCandidate).padStart(2, "0")}`
                    }
                    selected={selected === visibleUrl}
                    onSelect={
                      visibleUrl ? () => setSelected(visibleUrl) : undefined
                    }
                    onPreview={
                      visibleUrl
                        ? () =>
                            setPreview({
                              images: allImages,
                              index: allImages.indexOf(visibleUrl),
                            })
                        : undefined
                    }
                    onRetry={() =>
                      run(() => start(visibleJob.slot || activeCandidate))
                    }
                    onFallbackRetry={
                      route.fallback.configured
                        ? () =>
                            run(() =>
                              start(
                                visibleJob.slot || activeCandidate,
                                "fallback",
                              ),
                            )
                        : undefined
                    }
                    onCorrect={(request, correctionPlan) =>
                      run(() =>
                        post(`/api/jobs/${visibleJob.id}/retry`, {
                          correctionRequest: request,
                          correctionPlan,
                        }),
                      )
                    }
                    onInpaint={() => inpaint.openInpaint(visibleJob)}
                    correctionBusy={busy}
                  />
                  <ConsistencyCheck
                    job={visibleJob}
                    busy={busy}
                    onCheck={() => run(() => checkConsistency(visibleJob.id))}
                  />
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div>
                  <div className="empty-icon">◇</div>
                  <b>还没有换装候选</b>
                  <p>上传两张输入图片后即可开始换装。</p>
                </div>
              </div>
            )}
            <div className="tryon-side-column">
              <div className="tryon-settings-inline">
                <div className="panel-head">
                  <div>
                    <h3>生成设置</h3>
                    <small>真实模型状态</small>
                  </div>
                </div>
                <div className="tryon-setting-group">
                  <h3 className="section-label">生成模式</h3>
                  <div className="mode-grid">
                    {TRYON_MODE_OPTIONS.map((option) => {
                      const sub =
                        option.id === "quality"
                          ? routed
                            ? route.primary.model
                            : health.tryonProvider === "custom"
                              ? "自定义模型"
                              : "FASHN Try-On Max"
                          : standardProvider;
                      return (
                        <button
                          key={`tryon-mode-${option.id}`}
                          className={`mode-card ${mode === option.id ? "active" : ""}`}
                          onClick={() => setMode(option.id)}
                        >
                          <b>{option.label}</b>
                          <small>{sub}</small>
                          {option.id === "quality" &&
                            !routed &&
                            health.tryonProvider !== "custom" &&
                            !health.fashn && <em>未配置</em>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="tryon-setting-group">
                  <h3 className="section-label">候选数量</h3>
                  <div className="segment">
                    <button
                      className={count === 1 ? "active" : ""}
                      onClick={() => setCount(1)}
                    >
                      生成1张
                    </button>
                    <button
                      className={count === 2 ? "active" : ""}
                      onClick={() => setCount(2)}
                    >
                      生成2张
                    </button>
                  </div>
                </div>
                <div className="tryon-setting-group">
                  <h3 className="section-label">人物显示</h3>
                  <label className="check-item face-visibility-toggle">
                    <input
                      type="checkbox"
                      checked={face}
                      onChange={(event) => setFace(event.target.checked)}
                    />
                    露出脸部
                  </label>
                  <small className="setting-help">
                    {face
                      ? "已开启：允许露出并保持原模特脸部。"
                      : "默认关闭：生成结果不得露出或补画脸部。"}
                  </small>
                </div>
                <div className="tryon-setting-group">
                  <h3 className="section-label">细节保护</h3>
                  <div className="protection-grid">
                    {TRYON_PROTECTION_OPTIONS.map((option) => (
                      <label
                        className="check-item"
                        key={`tryon-protection-${option.id}`}
                      >
                        <input
                          type="checkbox"
                          checked={protectedItems.includes(option.label)}
                          onChange={() =>
                            setProtected((value) =>
                              value.includes(option.label)
                                ? value.filter((item) => item !== option.label)
                                : [...value, option.label],
                            )
                          }
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  <details className="structure-prompt-preview">
                    <summary>查看自动组成的商品结构保护提示</summary>
                    <pre>{structurePrompt}</pre>
                  </details>
                </div>
                <div className="tryon-setting-group">
                  <div className="model-card">
                    <div className="model-row">
                      <span>{modelName}</span>
                      <span
                        className={`badge ${configured ? "success" : "failed"}`}
                      >
                        {configured ? "可用" : "未配置"}
                      </span>
                    </div>
                    <small>提供商：{route.primary.providerName}</small>
                    <small>
                      备用模型：
                      {route.fallback.configured
                        ? `${route.fallback.providerName} / ${route.fallback.model}`
                        : "未配置"}
                    </small>
                    {mode === "quality" &&
                      !routed &&
                      health.tryonProvider !== "custom" && (
                        <small>
                          精细模式使用 FASHN quality · 2K，每张候选独立生成。
                        </small>
                      )}
                  </div>
                  <div className="cost-card">
                    {mode === "quality" && health.tryonProvider !== "custom"
                      ? "FASHN 预计消耗：每张 4 credits"
                      : "预计费用暂不可用"}
                  </div>
                </div>
                <div className="tryon-setting-group">
                  <div className="generate-footer">
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        !productType ||
                        !garment.url ||
                        !model.url ||
                        !configured
                      }
                      onClick={() => run(() => start())}
                    >
                      {busy ? busyLabel : "▷ 开始换装"}
                    </button>
                    <GenerationControls
                      workflow="tryon"
                      jobs={historyJobs}
                      cancelGeneration={cancelGeneration}
                      clearWorkflowErrors={clearWorkflowErrors}
                      run={run}
                    />
                    <div className="status-line">
                      {configured
                        ? "输入与设置会保存在当前项目"
                        : health.tryonProvider === "custom"
                          ? "请先在服务器完成自定义图像 API 配置"
                          : mode === "quality"
                            ? "请先在服务器配置 FASHN_API_KEY，配置后重启工作台"
                            : "当前模型 API 尚未配置"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="confirm-block">
            <button
              className="primary"
              disabled={!canConfirmSelected}
              onClick={() => run(() => confirmFlow("tryon", [selected]))}
            >
              {selectedJob && ["needs_redo", "failed"].includes(selectedJob.status)
                ? "✓ 人工审核通过并确认"
                : "✓ 确认选中的换装结果"}
            </button>
            <p className={canConfirmSelected ? "" : "confirm-hint"}>
              {confirmHint}
            </p>
          </div>
        </section>
      </div>
      {preview && (
        <ImagePreviewDialog {...preview} onClose={() => setPreview(null)} />
      )}
      {inpaint.dialog}
    </>
  );
}
