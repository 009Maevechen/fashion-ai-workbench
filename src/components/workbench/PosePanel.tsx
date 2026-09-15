"use client";

import { canManuallyConfirmJob } from "@/lib/tryon-confirmation";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Job, PoseReferenceAnalysis, PoseTemplateGroup } from "@/lib/db";
import type { PanelProps } from "./types";
import AssetUploadCard, { type LocalAsset } from "./AssetUploadCard";
import ResultCard from "./ResultCard";
import { useInpaint } from "./useInpaint";
import ConsistencyCheck from "./ConsistencyCheck";
import ImagePreviewDialog from "./ImagePreviewDialog";
import ClearAssetsButton from "./ClearAssetsButton";
import ClearResultsButton from "./ClearResultsButton";
import { POSE_PRESETS } from "@/lib/ai/pose-presets";
import { hasClearableSourceAssets } from "@/lib/asset-cleanup";
import { hasWorkflowResults } from "@/lib/result-cleanup";
import { poseLibrarySourceAvailability } from "@/lib/pose-library-utils";
import { useProjectDraftAutosave } from "./useProjectDraftAutosave";
import { buildProductProtectionPrompt } from "@/lib/product-structure";
import { thumbnailUrl } from "@/lib/image-url";
import GenerationControls from "./GenerationControls";
import LazyThumbnail from "./LazyThumbnail";

const DETAILS =
  "保持服装领口、袖口、肩部、下摆、纽扣、印花、面料纹理和服装长度，不得改变商品设计。";
const SHOT_LABEL: Record<string, string> = {
  full_body: "全身",
  half_body: "半身",
  upper_body: "上半身",
  lower_body: "下半身",
};

export function relatedPoseHistoryJobs(selected: Job | undefined, jobs: Job[]) {
  if (!selected) return [];
  if (selected.batchId)
    return jobs.filter((job) => job.batchId === selected.batchId);
  const selectedTime = new Date(selected.startedAt).getTime();
  const compatible = jobs.filter(
    (job) =>
      !job.batchId &&
      (!selected.sourceModelImage ||
        job.sourceModelImage === selected.sourceModelImage) &&
      Math.abs(new Date(job.startedAt).getTime() - selectedTime) <=
        10 * 60 * 1000,
  );
  return [1, 2, 3]
    .map(
      (slot) =>
        compatible
          .filter((job) => job.slot === slot)
          .sort(
            (a, b) =>
              Math.abs(new Date(a.startedAt).getTime() - selectedTime) -
              Math.abs(new Date(b.startedAt).getTime() - selectedTime),
          )[0],
    )
    .filter((job): job is Job => Boolean(job));
}

export default function PosePanel({
  p,
  jobs,
  historyJobs,
  health,
  modelRouting,
  busy,
  run,
  refreshProject,
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
  const saved = p.settings.pose,
    savedMatchesProduct = saved?.productType === p.productType;
  const preset =
    savedMatchesProduct && saved?.poseInstructions?.length === 3
      ? saved.poseInstructions
      : POSE_PRESETS[p.productType];
  const [mode, setMode] = useState<"fast" | "standard" | "quality">(
      saved?.mode || "standard",
    ),
    [shot, setShot] = useState(saved?.shotType || "全身"),
    [focus, setFocus] = useState<"" | "upper" | "lower">(saved?.focus || ""),
    [face] = useState(saved?.face || false),
    [faceSlots, setFaceSlots] = useState<boolean[]>(
      saved?.faces?.length ? saved.faces : [],
    ),
    [background, setBackground] = useState(saved?.background ?? true),
    [details, setDetails] = useState(saved?.detailRequirements || DETAILS),
    [instructions, setInstructions] = useState(preset),
    [referenceAnalyses, setReferenceAnalyses] = useState<
      PoseReferenceAnalysis[]
    >(saved?.referenceAnalyses || []),
    [analyzingReferences, setAnalyzingReferences] = useState(false),
    [sourceMode, setSourceMode] = useState<"confirmed" | "standalone">(
      saved?.sourceMode || (p.confirmedTryonImage ? "confirmed" : "standalone"),
    ),
    [referenceMode, setReferenceMode] = useState<"library" | "upload">(
      saved?.referenceMode || "library",
    ),
    [source, setSource] = useState<LocalAsset>({
      url: p.assets.standalonePoseInputImage,
      name: "独立姿势输入图",
      status: p.assets.standalonePoseInputImage ? "saved" : "idle",
    }),
    [references, setReferences] = useState<LocalAsset[]>(() =>
      Array.from({ length: 3 }, (_, index) => ({
        url: p.assets.poseReferenceImages?.[index],
        name: `姿势参考图${index + 1}`,
        status: p.assets.poseReferenceImages?.[index] ? "saved" : "idle",
      })),
    ),
    [groups, setGroups] = useState<PoseTemplateGroup[]>([]),
    [libraryQuery, setLibraryQuery] = useState(""),
    [selectedGroup, setSelectedGroup] = useState(
      p.selectedPoseTemplateGroupId || "",
    ),
    [selected, setSelected] = useState<string[]>(
      p.confirmedPoseImages ||
        saved?.selectedResultImages ||
        jobs.flatMap((j) => j.outputImages),
    ),
    [preview, setPreview] = useState<{
      images: string[];
      index: number;
    } | null>(null),
    [saveLibrary, setSaveLibrary] = useState(false),
    [libraryName, setLibraryName] = useState(`${p.productType}常用三姿势`),
    [libraryMessage, setLibraryMessage] = useState("");
  const [librarySource, setLibrarySource] = useState<"references" | "results">(
    "references",
  );
  const [historyJobId, setHistoryJobId] = useState("");
  const router = useRouter(),
    searchParams = useSearchParams();
  const inventoryGroupId = searchParams.get("groupId");
  useEffect(() => {
    if (!inventoryGroupId) return;
    const apply = async () => {
      try {
        await post(`/api/projects/${p.id}/pose-inventory-apply`, {
          groupId: inventoryGroupId,
        });
        setReferenceMode("upload");
        setSelectedGroup("");
        await refreshProject();
        router.replace(`/projects/${p.id}/pose`, { scroll: false });
      } catch (error) {
        console.error(
          error instanceof Error ? error.message : "应用姿势组失败",
        );
      }
    };
    void apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryGroupId, p.id]);
  useEffect(() => {
    fetch("/api/pose-library", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => setGroups([]));
  }, []);
  useEffect(() => {
    setReferences(
      Array.from({ length: 3 }, (_, index) => ({
        url: p.assets.poseReferenceImages?.[index],
        name: `姿势参考图${index + 1}`,
        status: p.assets.poseReferenceImages?.[index] ? "saved" : "idle",
      })),
    );
    setSelectedGroup(p.selectedPoseTemplateGroupId || "");
  }, [p.assets.poseReferenceImages, p.selectedPoseTemplateGroupId]);
  useEffect(() => {
    const currentImages = jobs
      .filter(
        (job) =>
          canManuallyConfirmJob(job),
      )
      .flatMap((job) => job.outputImages);
    setSelected((value) =>
      value.filter((image) => currentImages.includes(image)),
    );
  }, [jobs]);
  const sourceUrl =
      sourceMode === "confirmed" ? p.confirmedTryonImage : source.url,
    referenceUrls = references.map((item) => item.url || ""),
    route = modelRouting.pose,
    routed = route.primary.source === "stored";
  const configured = routed
    ? route.primary.configured
    : health.poseProvider === "volcengine"
      ? health.volcengine
      : mode === "standard"
        ? health.volcengine
        : mode === "fast"
          ? health.fluxKlein
          : health.fluxPro;
  const productProtection = buildProductProtectionPrompt(
      p.productType,
      p.profile,
    ),
    analysesCurrent =
      referenceAnalyses.length === 3 &&
      referenceAnalyses.every(
        (analysis, index) => analysis.referenceImage === referenceUrls[index],
      );
  const historyItems = historyJobs.filter((job) =>
      canManuallyConfirmJob(job),
    ),
    historyJob = historyItems.find((job) => job.id === historyJobId),
    historyBatch = relatedPoseHistoryJobs(historyJob, historyItems),
    historyBatchBySlot = new Map(historyBatch.map((job) => [job.slot, job]));
  const images = historyItems.flatMap((j) => j.outputImages),
    modelLabel = routed
      ? route.primary.model
      : health.poseProvider === "volcengine"
        ? "Seedream 5.0"
        : "FLUX",
    reviews = p.poseReviewStates || {};
  const visibleGroups = useMemo(
    () =>
      groups
        .filter(
          (group) =>
            !group.archived &&
            `${group.name} ${group.description || ""} ${group.styleTags.join(" ")}`
              .toLowerCase()
              .includes(libraryQuery.toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(b.productTypes.includes(p.productType)) -
              Number(a.productTypes.includes(p.productType)) ||
            Number(b.favorite) - Number(a.favorite) ||
            b.usageCount - a.usageCount,
        ),
    [groups, libraryQuery, p.productType],
  );
  const resultImages = [1, 2, 3].map(
    (slot) => jobs.find((job) => job.slot === slot)?.outputImages[0] || "",
  ) as [string, string, string];
  const libraryAvailability = poseLibrarySourceAvailability(
    referenceUrls,
    resultImages,
    reviews,
  );
  // 使用当前任务优先，避免重新生成后结果已更新但历史任务列表尚未同步，导致确认按钮被误禁用。
  const selectedJobs = selected
    .map(
      (image) =>
        jobs.find((job) => job.outputImages.includes(image)) ||
        historyJobs.find((job) => job.outputImages.includes(image)),
    )
    .filter((job): job is Job => Boolean(job));
  const selectedSlots = [
    ...new Set(
      selectedJobs
        .map((job) => job.slot)
        .filter((slot): slot is number => Boolean(slot)),
    ),
  ];
  const selectedReviewed =
    selected.length >= 2 &&
    selected.length <= 3 &&
    selectedSlots.length === selected.length &&
    selectedSlots.every((slot) => reviews[String(slot)] === "approved");
  const selectedCurrent =
    selectedJobs.length === selected.length &&
    selectedJobs.every(
      (job) =>
        canManuallyConfirmJob(job),
    );
  const draftSettings = useMemo(
    () => ({
      settings: {
        ...p.settings,
        pose: {
          mode,
          productType: p.productType,
          shotType: shot,
          face,
          faces: faceSlots.length ? faceSlots : undefined,
          background,
          detailRequirements: details,
          poseInstructions: instructions,
          referenceAnalyses,
          sourceMode,
          referenceMode,
          selectedResultImages: selected,
          focus,
        },
      },
    }),
    [
      background,
      details,
      face,
      faceSlots,
      focus,
      instructions,
      mode,
      p.productType,
      p.settings,
      referenceMode,
      referenceAnalyses,
      selected,
      shot,
      sourceMode,
    ],
  );
  useProjectDraftAutosave(p.id, draftSettings);

  async function persistSource(a: LocalAsset) {
    setSource({ ...a, status: "uploading" });
    try {
      const url = await persistAsset(
        a.file,
        "standalonePoseInputImage",
        "pose-source",
      );
      setSource({ ...a, url, file: undefined, status: "saved" });
    } catch (e) {
      setSource({
        ...a,
        status: "failed",
        error: e instanceof Error ? e.message : "上传失败",
      });
      throw e;
    }
  }
  async function persistReference(index: number, a: LocalAsset) {
    setReferences((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...a, status: "uploading" } : item,
      ),
    );
    try {
      const url = await persistAsset(
        a.file,
        "poseReferenceImages",
        `pose-reference-${index + 1}`,
        index,
      );
      setReferenceMode("upload");
      setSelectedGroup("");
      setReferences((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index
            ? { ...a, url, file: undefined, status: "saved" }
            : item,
        ),
      );
    } catch (e) {
      setReferences((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...a,
                status: "failed",
                error: e instanceof Error ? e.message : "上传失败",
              }
            : item,
        ),
      );
      throw e;
    }
  }
  async function saveSettings() {
    await saveProject(draftSettings);
  }
  async function analyzeReferences() {
    if (referenceUrls.some((url) => !url))
      throw new Error("请先准备完整的3张姿势参考图");
    setAnalyzingReferences(true);
    try {
      const response = await fetch(`/api/projects/${p.id}/pose-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poseReferenceImages: referenceUrls }),
      });
      const data = (await response.json()) as {
        analyses?: PoseReferenceAnalysis[];
        error?: string;
      };
      if (!response.ok || data.analyses?.length !== 3)
        throw new Error(data.error || "姿势参考图识别失败");
      const nextInstructions = data.analyses.map(
        (analysis) => analysis.instruction,
      );
      setReferenceAnalyses(data.analyses);
      setInstructions(nextInstructions);
      return { analyses: data.analyses, instructions: nextInstructions };
    } finally {
      setAnalyzingReferences(false);
    }
  }
  async function clearAllAssets() {
    await clearSourceAssets();
    setSource({ status: "idle" });
    setReferences(Array.from({ length: 3 }, () => ({ status: "idle" })));
    setSelectedGroup("");
    setReferenceAnalyses([]);
    setPreview(null);
  }
  async function clearResults() {
    await clearWorkflowResults("pose");
    setSelected([]);
    setHistoryJobId("");
    setPreview(null);
  }
  async function applyGroup(id: string) {
    await post(`/api/pose-library/${id}/use`, { projectId: p.id });
    setReferenceMode("library");
    setSelectedGroup(id);
    await refreshProject();
  }
  async function start(
    slot?: number,
    modelPreference: "primary" | "fallback" = "primary",
  ) {
    if (!sourceUrl)
      throw new Error("请选择已确认换装图或独立上传一张模特商品图");
    if (referenceUrls.some((url) => !url))
      throw new Error(
        "请先从姿势库选择一组模板，或上传姿势01、02、03三张参考图",
      );
    const recognized = analysesCurrent
      ? { analyses: referenceAnalyses, instructions }
      : await analyzeReferences();
    await saveProject({
      settings: {
        ...p.settings,
        pose: {
          ...draftSettings.settings.pose,
          poseInstructions: recognized.instructions,
          referenceAnalyses: recognized.analyses,
        },
      },
    });
    await post("/api/pose", {
      projectId: p.id,
      sourceImage: sourceUrl,
      poseReferenceImages: referenceUrls,
      referenceMode,
      mode,
      shotType: shot,
      face,
      faces: faceSlots.length ? faceSlots : undefined,
      background,
      detailRequirements: details,
      poseInstructions: recognized.instructions,
      focus: focus || undefined,
      modelPreference,
      ...(slot ? { slot } : {}),
    });
  }
  async function review(slot: number, state: "approved" | "redo") {
    await saveProject({
      poseReviewStates: { ...reviews, [String(slot)]: state },
    });
  }
  async function checkConsistency(jobId: string) {
    await post(`/api/projects/${p.id}/consistency-check`, { jobId });
  }
  async function checkAllConsistency() {
    const checkable = jobs
      .filter((job) => job.outputImages[0] && job.dependencyStatus !== "stale")
      .sort((a, b) => (a.slot || 0) - (b.slot || 0));
    if (!checkable.length) throw new Error("当前没有可检测的姿势结果");
    for (const job of checkable)
      await post(`/api/projects/${p.id}/consistency-check`, { jobId: job.id });
  }
  async function saveToLibrary() {
    setLibraryMessage("");
    const usingReferences = librarySource === "references";
    if (usingReferences && !libraryAvailability.references)
      throw new Error("请先准备完整的三张姿势参考图");
    if (!usingReferences && !libraryAvailability.results)
      throw new Error("使用生成结果保存时，三张结果都必须生成并审核通过");
    const libraryImages = (usingReferences ? referenceUrls : resultImages) as [
      string,
      string,
      string,
    ];
    const response = await fetch("/api/pose-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: libraryName,
          description: `来自 ${p.sku} ${p.productName} · ${usingReferences ? "姿势参考图" : "已审核生成结果"}`,
          productTypes: [p.productType],
          shotType:
            shot === "上半身"
              ? "upper_body"
              : shot === "下半身"
                ? "lower_body"
                : "full_body",
          faceMode: face ? "visible" : "hidden",
          styleTags: ["电商展示"],
          platformTags: [],
          displayFocus: [],
          favorite: false,
          sourceProjectId: p.id,
          images: libraryImages,
          poseNames: ["姿势01", "姿势02", "姿势03"],
          poseDescriptions: instructions as [string, string, string],
        }),
      }),
      data = await response.json();
    if (!response.ok) throw new Error(data.error || "保存姿势库失败");
    setLibraryMessage(
      data.created
        ? "已保存到姿势库"
        : `检测到相同姿势，已使用现有模板“${data.group.name}”，没有重复保存`,
    );
    setGroups(
      await fetch("/api/pose-library", { cache: "no-store" }).then((r) =>
        r.json(),
      ),
    );
    setSaveLibrary(false);
  }

  const inpaint = useInpaint({ project: p, sourceStep: "pose", submit: post });
  return (
    <>
      <div className="workbench-grid">
        <section className="card pose-input-panel">
          <div className="panel-head">
            <h2>输入素材与姿势参考</h2>
            <div className="panel-actions">
              <span className="badge">一一对应</span>
              <ClearAssetsButton
                disabled={busy || !hasClearableSourceAssets(p)}
                onConfirm={clearAllAssets}
              />
            </div>
          </div>
          <h3>商品模特图</h3>
          <div className="segment">
            <button
              className={sourceMode === "confirmed" ? "active" : ""}
              disabled={!p.confirmedTryonImage}
              onClick={() => setSourceMode("confirmed")}
            >
              使用已确认换装图
            </button>
            <button
              className={sourceMode === "standalone" ? "active" : ""}
              onClick={() => setSourceMode("standalone")}
            >
              独立上传图片
            </button>
          </div>
          {sourceMode === "confirmed" && p.confirmedTryonImage ? (
            <button
              className="image-button source-image-button"
              onClick={() =>
                setPreview({ images: [p.confirmedTryonImage!], index: 0 })
              }
            >
              <LazyThumbnail
                className="result-image"
                src={thumbnailUrl(p.confirmedTryonImage, 720)}
                alt="已确认换装图"
              />
            </button>
          ) : (
            <AssetUploadCard
              label="模特商品图"
              description="不经过换装也可以直接上传"
              value={source}
              onChange={(a) => run(() => persistSource(a))}
              onDelete={() =>
                run(async () => {
                  await deleteAsset("standalonePoseInputImage");
                  setSource({ status: "idle" });
                })
              }
              onPreview={() =>
                source.url && setPreview({ images: [source.url], index: 0 })
              }
            />
          )}
          <div className="pose-reference-heading">
            <div>
              <h3>姿势参考（严格复刻）</h3>
              <small>
                姿势01参考图只用于生成姿势01，三张分别调用模型；参考图姿势优先于文字描述。
              </small>
            </div>
            <div className="panel-actions">
              <a
                href={`/inventory/poses?select=1&projectId=${p.id}`}
                className="text-button"
              >
                从姿势库存选择 →
              </a>
              <a href="/libraries/poses" className="text-button">
                管理姿势库 →
              </a>
            </div>
          </div>
          <div className="segment">
            <button
              className={referenceMode === "library" ? "active" : ""}
              onClick={() => setReferenceMode("library")}
            >
              从姿势库选择
            </button>
            <button
              className={referenceMode === "upload" ? "active" : ""}
              onClick={() => setReferenceMode("upload")}
            >
              上传3张参考图
            </button>
          </div>
          {referenceMode === "library" ? (
            <div className="pose-library-picker">
              <input
                className="library-search"
                placeholder="搜索模板名称或标签"
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
              />
              <div className="pose-library-mini-list">
                {visibleGroups.length ? (
                  visibleGroups.slice(0, 6).map((group) => (
                    <button
                      key={group.id}
                      className={`pose-library-mini-card ${selectedGroup === group.id ? "active" : ""}`}
                      onClick={() => run(() => applyGroup(group.id))}
                    >
                      <span className="pose-library-thumbs">
                        {group.poses.map((pose) => (
                          <img
                            key={pose.id}
                            src={pose.thumbnailPath || pose.referenceImagePath}
                            alt={pose.name}
                          />
                        ))}
                      </span>
                      <b>{group.name}</b>
                      <small>
                        {group.productTypes.join("、")} ·{" "}
                        {SHOT_LABEL[group.shotType]} · 使用{group.usageCount}次
                      </small>
                    </button>
                  ))
                ) : (
                  <div className="empty-state compact">
                    姿势库还没有模板，可切换到“上传3张参考图”或前往新建。
                  </div>
                )}
              </div>
            </div>
          ) : referenceUrls.some((url) => !url) ? (
            <div className="pose-reference-grid">
              {references.map((asset, index) => (
                <AssetUploadCard
                  key={index}
                  label={`姿势参考图 ${String(index + 1).padStart(2, "0")}`}
                  description={`对应生成姿势${index + 1}`}
                  value={asset}
                  onChange={(a) => run(() => persistReference(index, a))}
                  onDelete={() =>
                    run(async () => {
                      await deleteAsset("poseReferenceImages", index);
                      setReferences((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { status: "idle" } : item,
                        ),
                      );
                    })
                  }
                  onPreview={() =>
                    asset.url &&
                    setPreview({
                      images: referenceUrls.filter(Boolean),
                      index: referenceUrls.filter(Boolean).indexOf(asset.url),
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="selected-template-note">
              三张参考图已准备完成，请在“三种姿势结果”中查看完整图片。
            </div>
          )}
          {referenceMode === "library" && selectedGroup && (
            <div className="selected-template-note">
              已选择：
              {p.poseTemplateSnapshot?.name ||
                groups.find((group) => group.id === selectedGroup)?.name}
              。项目已保存模板快照，原模板以后修改不会悄悄改变本项目。
            </div>
          )}
          <section
            className="process-history pose-process-history"
            aria-labelledby="pose-process-history-title"
          >
            <div className="process-history-head">
              <div>
                <h3 id="pose-process-history-title">历史生成记录</h3>
                <small>点击小图回到该照片的姿势参考与制作结果</small>
              </div>
              <div>
                {historyJob && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setHistoryJobId("")}
                  >
                    返回当前结果
                  </button>
                )}
                <span>{historyItems.length} 张</span>
              </div>
            </div>
            {historyItems.length ? (
              <div className="process-history-grid">
                {historyItems.map((job, index) => (
                  <button
                    type="button"
                    className={job.id === historyJobId ? "active" : ""}
                    key={job.id}
                    onClick={() => setHistoryJobId(job.id)}
                    title={`姿势 ${String(job.slot || 1).padStart(2, "0")} · ${new Date(job.startedAt).toLocaleString("zh-CN")}`}
                  >
                    <LazyThumbnail
                      src={thumbnailUrl(job.outputImages[0])}
                      alt={`姿势历史生成图 ${index + 1}`}
                    />
                    <span>姿势 {String(job.slot || 1).padStart(2, "0")}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="process-history-empty">
                生成过的三种姿势照片会保存在这里
              </div>
            )}
          </section>
          <label className="field">
            重点细节要求（贯穿后续流程）
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </label>
          <details className="structure-prompt-preview">
            <summary>查看从产品图识别并自动锁定的商品细节</summary>
            <pre>{productProtection}</pre>
          </details>
        </section>
        <section className="card">
          <div className="panel-head">
            <h2>三种姿势结果</h2>
            <div className="panel-actions">
              <span className="badge">
                {historyJob ? "正在查看历史批次" : "3个独立子任务"}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={
                  busy ||
                  !jobs.some(
                    (job) =>
                      job.outputImages[0] && job.dependencyStatus !== "stale",
                  )
                }
                onClick={() => run(checkAllConsistency)}
              >
                一键质检三姿势
              </button>
              <ClearResultsButton
                workflow="pose"
                disabled={busy || !hasWorkflowResults(p, jobs, "pose")}
                onConfirm={clearResults}
              />
            </div>
          </div>
          <div className="pose-result-grid">
            {[1, 2, 3].map((slot) => {
              const historicalJob = historyBatchBySlot.get(slot),
                job = historyJob
                  ? historicalJob
                  : jobs.find((item) => item.slot === slot),
                url = job?.outputImages[0],
                reviewState = reviews[String(slot)] || "pending",
                referenceUrl =
                  historicalJob?.poseReferenceImage || referenceUrls[slot - 1],
                instruction =
                  historicalJob?.poseInstruction || instructions[slot - 1];
              return (
                <div
                  className="pose-result-column"
                  key={`${slot}:${job?.id || "empty"}`}
                >
                  <div className="pose-reference-pair">
                    {referenceUrl ? (
                      <LazyThumbnail
                        src={thumbnailUrl(referenceUrl, 480)}
                        alt={`姿势${slot}参考图`}
                      />
                    ) : (
                      <span>缺少参考图</span>
                    )}
                    <small>
                      {historicalJob ? "历史批次姿势参考" : "姿势强制参考"}
                    </small>
                  </div>
                  <ResultCard
                    job={job}
                    label={`${historicalJob ? "历史 · " : ""}姿势 ${String(slot).padStart(2, "0")}`}
                    selected={!!url && selected.includes(url)}
                    onSelect={
                      url
                        ? () =>
                            setSelected((value) =>
                              value.includes(url)
                                ? value.filter((item) => item !== url)
                                : [...value, url],
                            )
                        : undefined
                    }
                    onPreview={
                      url
                        ? () =>
                            setPreview({ images, index: images.indexOf(url) })
                        : undefined
                    }
                    onRetry={() => run(() => start(slot))}
                    onFallbackRetry={
                      route.fallback.configured
                        ? () => run(() => start(slot, "fallback"))
                        : undefined
                    }
                    onCorrect={
                      job
                        ? (request, correctionPlan) =>
                            run(() =>
                              post(`/api/jobs/${job.id}/retry`, {
                                correctionRequest: request,
                                correctionPlan,
                              }),
                            )
                        : undefined
                    }
                    onInpaint={job ? () => inpaint.openInpaint(job) : undefined}
                    correctionBusy={busy}
                  />
                  <ConsistencyCheck
                    job={job}
                    busy={busy}
                    onCheck={() => job && run(() => checkConsistency(job.id))}
                  />
                  {url && (
                    <div className="pose-review-actions">
                      <button
                        className={
                          reviewState === "approved" ? "review-approved" : ""
                        }
                        disabled={
                          !canManuallyConfirmJob(job, url)
                        }
                        onClick={() => run(() => review(slot, "approved"))}
                      >
                        ✓ 审核通过
                      </button>
                      <button
                        className={reviewState === "redo" ? "review-redo" : ""}
                        onClick={() => run(() => review(slot, "redo"))}
                      >
                        ↻ 需要重做
                      </button>
                    </div>
                  )}
                  {instruction && (
                    <details className="pose-instruction-collapse">
                      <summary>
                        <span>查看姿势、景别与构图说明</span>
                        <span className="pose-instruction-toggle" aria-hidden="true">
                          <span className="collapsed">展开</span>
                          <span className="expanded">收起</span>
                          <span className="chevron">⌄</span>
                        </span>
                      </summary>
                      <small>{instruction}</small>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
          <details className="pose-ai-note-collapse">
            <summary>
              <span>查看 AI 人物与服装检测说明</span>
              <span className="pose-instruction-toggle" aria-hidden="true">
                <span className="collapsed">展开</span>
                <span className="expanded">收起</span>
                <span className="chevron">⌄</span>
              </span>
            </summary>
            <div className="notice">
              AI检测会同时核对人物底图与原产品：允许姿势动作变化，但模特身份、脸部、发型、肤色、体型、配饰及服装设计必须保持一致；复制姿势参考图人物或生成新模特会标记失败。AI结论用于辅助，最终仍由你人工审核。
            </div>
          </details>
          {libraryMessage && (
            <div className="notice success-note">{libraryMessage}</div>
          )}
          <div className="confirm-block pose-confirm-actions">
            <button
              className="secondary"
              disabled={
                !libraryAvailability.references && !libraryAvailability.results
              }
              onClick={() => {
                setLibrarySource(
                  libraryAvailability.references ? "references" : "results",
                );
                setSaveLibrary(true);
              }}
            >
              保存为姿势库模板
            </button>
            <button
              className="primary"
              disabled={!selectedReviewed || !selectedCurrent || busy}
              onClick={() => run(() => confirmFlow("pose", selected))}
            >
              确认已选姿势图（{selected.length}张）
            </button>
            <small>
              姿势库优先保存三张参考图；进入复色只需要选择并审核通过至少2张生成结果。
            </small>
          </div>
        </section>
        <section className="card settings-panel pose-settings-panel">
          <div className="panel-head">
            <h2>姿势设置</h2>
            <span className="pose-template-badge">{p.productType}模板</span>
          </div>
          <div className="notice pose-settings-note">
            严格参考模式已开启：参考图决定姿势骨架和构图，文字只作辅助。
          </div>
          <div className="pose-settings-footer">
            <div className="model-card pose-model-card">
              <div className="model-row">
                <div>
                  <small>当前生成模型</small>
                  <strong>
                    {routed
                      ? route.primary.model
                      : health.poseProvider === "volcengine"
                        ? "Doubao Seedream 5.0"
                        : mode === "standard"
                          ? "Seedream 5.0"
                          : mode === "fast"
                            ? "FLUX.2 Klein"
                            : "FLUX.2 Pro"}
                  </strong>
                </div>
                <span className={`badge ${configured ? "success" : "failed"}`}>
                  {configured ? "可用" : "未配置"}
                </span>
              </div>
              <small>提供商：{route.primary.providerName}</small>
              <small>要求：支持商品图＋姿势参考图的多图编辑</small>
              <small>
                备用模型：
                {route.fallback.configured
                  ? `${route.fallback.providerName} / ${route.fallback.model}`
                  : "未配置"}
              </small>
            </div>
            <div className="pose-settings-actions">
              <button className="secondary" onClick={() => run(saveSettings)}>
                保存姿势设置
              </button>
              <div className="generate-footer">
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !sourceUrl ||
                    referenceUrls.some((url) => !url) ||
                    !configured
                  }
                  onClick={() => run(() => start())}
                >
                  严格按3张参考生成姿势
                </button>
                <GenerationControls
                  workflow="pose"
                  jobs={historyJobs}
                  cancelGeneration={cancelGeneration}
                  clearWorkflowErrors={clearWorkflowErrors}
                  run={run}
                />
                {!sourceUrl ? (
                  <small>请先准备商品模特图</small>
                ) : referenceUrls.some((url) => !url) ? (
                  <small>请准备完整的3张姿势参考图</small>
                ) : null}
              </div>
            </div>
          </div>
          <div className="pose-settings-overview">
            <div className="pose-setting-group pose-quality-group">
              <div className="pose-setting-heading">
                <h3>生成质量</h3>
                <small>标准模式兼顾速度与细节</small>
              </div>
              <div className="mode-grid">
                {[
                  ["fast", "快速", modelLabel],
                  ["standard", "标准", modelLabel],
                  ["quality", "精细", modelLabel],
                ].map(([key, name, model]) => (
                  <button
                    className={`mode-card ${mode === key ? "active" : ""}`}
                    key={key}
                    onClick={() => setMode(key as typeof mode)}
                  >
                    <b>{name}</b>
                    <small>{model}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="pose-setting-group pose-frame-group">
              <div className="pose-setting-heading">
                <h3>画面设置</h3>
                <small>姿势与构图始终以三张参考图为准</small>
              </div>
              <div className="pose-frame-fields">
                <label className="field">
                  景别
                  <select value={shot} onChange={(e) => setShot(e.target.value)}>
                    <option>全身</option>
                    <option>上半身</option>
                    <option>下半身</option>
                  </select>
                </label>
                <label className="field">
                  侧重展示
                  <select
                    value={focus}
                    onChange={(e) =>
                      setFocus(e.target.value as "" | "upper" | "lower")
                    }
                  >
                    <option value="">无侧重（按商品模特图景别）</option>
                    <option value="upper">侧重上半身</option>
                    <option value="lower">侧重下半身</option>
                  </select>
                </label>
              </div>
              <div className="pose-preserve-row">
                <div className="face-slot-list">
                  {[1, 2, 3].map((slot) => (
                    <label className="check-item" key={`pose-face-${slot}`}>
                      <input
                        type="checkbox"
                        checked={faceSlots[slot - 1] ?? face}
                        onChange={(e) =>
                          setFaceSlots((current) => {
                            const next = [...current];
                            next[slot - 1] = e.target.checked;
                            return next;
                          })
                        }
                      />
                      姿势{slot} 露出脸部
                    </label>
                  ))}
                </div>
                <div className="face-slot-bulk">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setFaceSlots([true, true, true])}
                  >
                    全选露脸
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setFaceSlots([false, false, false])}
                  >
                    全选不露脸
                  </button>
                </div>
                <label className="check-item">
                  <input
                    type="checkbox"
                    checked={background}
                    onChange={(e) => setBackground(e.target.checked)}
                  />
                  保持背景
                </label>
                <small className="setting-help">
                  每张姿势图可单独设置露脸或不露脸；不露脸时结果不得露出或补画脸部。
                </small>
              </div>
            </div>
          </div>
          <div className="pose-instruction-editor">
            <div className="panel-head">
              <div>
                <h3>辅助姿势描述</h3>
                <small>
                  AI先识别姿势、景别、镜头和构图，你可再手动调整。
                </small>
              </div>
              <button
                className="secondary"
                disabled={
                  busy ||
                  analyzingReferences ||
                  referenceUrls.some((url) => !url)
                }
                onClick={() =>
                  run(async () => {
                    await analyzeReferences();
                  })
                }
              >
                {analyzingReferences
                  ? "识别中…"
                  : analysesCurrent
                    ? "重新识别参考图"
                    : "识别姿势与景别"}
              </button>
            </div>
            <div className="pose-instruction-grid">
              {instructions.map((value, index) => (
                <label className="field pose-instruction-field" key={index}>
                  <span>姿势 {index + 1}</span>
                  <textarea
                    value={value}
                    onChange={(e) =>
                      setInstructions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? e.target.value : item,
                        ),
                      )
                    }
                  />
                  <small>
                    {referenceAnalyses[index]
                      ? `已识别景别：${referenceAnalyses[index].shotType}`
                      : "尚未识别参考图"}
                    <br />文字与参考图冲突时，以参考图为准。
                  </small>
                </label>
              ))}
            </div>
          </div>
        </section>
      </div>
      {preview && (
        <ImagePreviewDialog {...preview} onClose={() => setPreview(null)} />
      )}
      {saveLibrary && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSaveLibrary(false);
          }}
        >
          <div className="simple-dialog" role="dialog" aria-modal="true">
            <div className="panel-head">
              <h2>保存到姿势库</h2>
              <button
                className="icon-button"
                onClick={() => setSaveLibrary(false)}
              >
                ×
              </button>
            </div>
            <p>
              建议保存不带当前商品特征的姿势参考图。系统会检查图片哈希、视觉指纹和姿势说明，相同姿势不会重复占用硬盘。
            </p>
            <div className="library-source-options">
              <label className={librarySource === "references" ? "active" : ""}>
                <input
                  type="radio"
                  name="library-source"
                  checked={librarySource === "references"}
                  disabled={!libraryAvailability.references}
                  onChange={() => setLibrarySource("references")}
                />
                <b>保存三张姿势参考图（推荐）</b>
                <small>
                  {libraryAvailability.references
                    ? "可以保存"
                    : "需要完整三张参考图"}
                </small>
              </label>
              <label className={librarySource === "results" ? "active" : ""}>
                <input
                  type="radio"
                  name="library-source"
                  checked={librarySource === "results"}
                  disabled={!libraryAvailability.results}
                  onChange={() => setLibrarySource("results")}
                />
                <b>保存三张生成结果</b>
                <small>
                  {libraryAvailability.results
                    ? "三张均已审核通过"
                    : "需要三张生成结果全部审核通过"}
                </small>
              </label>
            </div>
            <label className="field">
              模板组名称
              <input
                value={libraryName}
                onChange={(event) => setLibraryName(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                className="secondary"
                onClick={() => setSaveLibrary(false)}
              >
                取消
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  (librarySource === "references"
                    ? !libraryAvailability.references
                    : !libraryAvailability.results)
                }
                onClick={() => run(saveToLibrary)}
              >
                保存模板组
              </button>
            </div>
          </div>
        </div>
      )}
      {inpaint.dialog}
    </>
  );
}
