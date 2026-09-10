import "server-only";
import crypto from "node:crypto";
import {
  addJob,
  getJob,
  getProject,
  listJobs,
  patchJob,
  updateProject,
  updateProjectWith,
  type GarmentDetailReference,
  type GarmentDetailLock,
  type InpaintMeta,
  type ProductType,
  type Project,
  type TargetColor,
} from "./db";
import { generateImage } from "./ai/generate";
import { resolveWorkflowModel } from "./ai/provider-settings";
import { downloadImage, localImage, saveOutput, toDataUrl } from "./ai/storage";
import {
  prepareProviderInput,
  sha,
  validateOutput,
  validateUpload,
  safeSegment,
} from "./ai/validators";
import type { GenerationMode, WorkflowType } from "./ai/types";
import type { ModelSlot } from "./ai/provider-settings-types";
import { TRYON_PROMPT_VERSION } from "./ai/prompts/tryon";
import { poseInputImages, posePrompt, POSE_PROMPT_VERSION } from "./ai/prompts/pose";
import { recolorPrompt, RECOLOR_PROMPT_VERSION } from "./ai/prompts/recolor";
import { inpaintPrompt, INPAINT_PROMPT_VERSION } from "./ai/prompts/inpaint";
import { POSE_PRESETS } from "./ai/pose-presets";
import {
  tryonCompletionPatch,
  tryonSubjectFidelityFailurePatch,
} from "./tryon-confirmation";
import { buildProductProtectionPrompt } from "./product-structure";
import {
  composeTryonDetailRequirements,
  normalizeTryonDetailRequirements,
} from "./tryon-detail-requirements";
import { appendModelRunRecord } from "./model-runs";
import { optimizeFinalImage } from "./image-optimize";
import { cachedPrepare } from "./image-cache";
import { acquireProviderSlot } from "./provider-concurrency";
import { optimizePrompt } from "./ai/prompt-optimize";
import { checkGarmentConsistency } from "./ai/garment-consistency";
import { parseColorName, colorNameRuleText } from "./color-name-semantics";
import { isGenerationCancelled } from "./generation-cancel";
import {
  correctionCommandText,
  correctionPlanFromText,
  type CorrectionCommandPlan,
} from "./correction-command";
import { checkCorrectionCommand } from "./ai/correction-check";
import type { RecolorStructureMode } from "./recolor-structure";
import { analyzeGarmentDesign } from "./ai/garment-detail-lock";
import { buildGarmentDetailProtectedDetails } from "./garment-detail-lock";
import { analyzeModelReference } from "./ai/tryon-model-reference";
import { runTryOnConsistencyCheck } from "./ai/tryon-consistency";
import {
  createTryOnLocalRepairMask,
  tryOnEditCapability,
} from "./ai/tryon-local-repair";
import {
  buildGarmentProtectionRules,
  buildTryOnEditTask,
  runLocalRepair,
  runTryOnEdit,
  type TryOnEditTask,
} from "./tryon-edit-pipeline";
import { randomGenerationSeed } from "./generation-seed";
import { isRetryableGenerationError } from "./generation-retry";
export const DEFAULT_DETAILS =
  "保持服装领口、袖口、肩部、下摆、纽扣数量、印花位置、白色包边、面料纹理和服装长度，不得增加或删除口袋、腰带、纽扣、印花或装饰。";
export async function persistUpload(file: File, sku: string, name: string) {
  const data = await validateUpload(file);
  return saveOutput(
    sku,
    "source",
    `${safeSegment(name)}-${crypto.randomUUID()}.jpg`,
    data,
  );
}
async function resolveExistingGarmentSource(
  project: Project,
  requested: string,
) {
  // 用户手动框选的单件服装是最高优先级来源，任何调用方都不能用原多色拼图覆盖它。
  if (project.assets.garmentCropImage) {
    try {
      await localImage(project.assets.garmentCropImage);
      return project.assets.garmentCropImage;
    } catch {
      /* 裁图损坏时继续验证请求图并保留真实错误 */
    }
  }
  try {
    await localImage(requested);
    return requested;
  } catch (error) {
    const fallback = project.assets.garmentImage;
    if (!fallback || fallback === requested) throw error;
    try {
      await localImage(fallback);
      return fallback;
    } catch {
      throw error;
    }
  }
}
async function existingHashes(
  projectId: string,
  workflow: WorkflowType,
  excludeSlot: number,
) {
  const jobs = await listJobs({ projectId, workflow });
  const urls = jobs
    .filter((j) => j.slot !== excludeSlot)
    .flatMap((j) => j.outputImages);
  const hashes = [];
  for (const u of urls)
    try {
      hashes.push(sha(await localImage(u)));
    } catch {}
  return hashes;
}
async function latestSlotJobs(
  projectId: string,
  workflow: WorkflowType,
  targetColorId?: string,
) {
  const latest = new Map<
    number,
    Awaited<ReturnType<typeof listJobs>>[number]
  >();
  for (const job of await listJobs({ projectId, workflow })) {
    if (targetColorId !== undefined && job.targetColorId !== targetColorId)
      continue;
    const slot = job.slot || 0;
    if (slot && !latest.has(slot)) latest.set(slot, job);
  }
  return latest;
}
async function runInOrder<T, R>(items: T[], work: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (const item of items) results.push(await work(item));
  return results;
}
function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
function slotState(latest: Map<number, { status: string }>, expected: number) {
  const values = Array.from({ length: expected }, (_, index) =>
    latest.get(index + 1),
  );
  const success = values.filter(
    (job) =>
      job && ["success", "needs_review", "confirmed"].includes(job.status),
  ).length;
  return success === 0
    ? "failed"
    : success < expected
      ? "partial_success"
      : "awaiting_confirmation";
}
async function markJobsStale(projectId: string, workflows: WorkflowType[]) {
  for (const j of await listJobs({ projectId }))
    if (
      workflows.includes(j.workflow) &&
      !["failed", "stale"].includes(j.status)
    )
      await patchJob(j.id, { status: "stale", dependencyStatus: "stale" });
}
async function invalidate(p: Project, from: "tryon" | "pose" | "color") {
  const staleColors = (p.targetColors || []).map((color) =>
    color.poseResults?.length ? { ...color, status: "stale" as const } : color,
  );
  if (from === "tryon") {
    await markJobsStale(p.id, ["pose", "recolor"]);
    await updateProject(p.id, {
      status: "需要重新审核",
      dependencyStatus: "needs_review",
      targetColors: staleColors,
      stepStatuses: {
        ...p.stepStatuses,
        "3": "stale",
        "4": "stale",
        "5": "stale",
      },
    });
  } else if (from === "pose") {
    await markJobsStale(p.id, ["recolor"]);
    await updateProject(p.id, {
      status: "需要重新审核",
      dependencyStatus: "needs_review",
      targetColors: staleColors,
      stepStatuses: { ...p.stepStatuses, "4": "stale", "5": "stale" },
    });
  } else
    await updateProject(p.id, {
      targetColors: (p.targetColors || []).map((color) => ({
        ...color,
        status: color.status === "draft" ? "draft" : "stale",
      })),
      dependencyStatus: "needs_review",
      stepStatuses: { ...p.stepStatuses, "4": "stale", "5": "stale" },
      status: "需要重新审核",
    });
}

async function runOne(args: {
  projectId: string;
  workflow: WorkflowType;
  mode: GenerationMode;
  modelSlot?: ModelSlot;
  images: string[];
  prompt: string;
  promptVersion: string;
  folder: string;
  filename: string;
  slot: number;
  otherHashes?: string[];
  poseInstruction?: string;
  poseReferenceImage?: string;
  sourceModelImage?: string;
  targetColorId?: string;
  colorName?: string;
  mask?: string;
  inpaint?: InpaintMeta;
  batchId?: string;
  correctionPlan?: CorrectionCommandPlan;
  detailReferenceImages?: GarmentDetailReference[];
  garmentDetailLockVersion?: GarmentDetailLock["version"];
  tryonEditTask?: TryOnEditTask;
  detailRepairOfJobId?: string;
  detailRepairAttempt?: number;
}) {
  const project = await getProject(args.projectId);
  if (!project) throw new Error("项目不存在");
  const correctionPlan =
      args.correctionPlan || correctionPlanFromText(args.prompt),
    choice = await resolveWorkflowModel(
      args.workflow === "inpaint" ? "recolor" : args.workflow,
      args.mode,
      args.modelSlot || "primary",
    ),
    id = crypto.randomUUID(),
    seed = randomGenerationSeed(),
    startedAt = new Date().toISOString();
  args.correctionPlan = correctionPlan;
  if (isGenerationCancelled(project.id, args.workflow))
    throw new Error("任务已被用户取消");
  await addJob({
    id,
    projectId: project.id,
    sku: project.sku,
    workflow: args.workflow,
    provider: choice.name,
    providerId: choice.id,
    providerType: choice.type,
    model: choice.model,
    modelSlot: args.modelSlot || "primary",
    mode: args.mode,
    inputImages: args.images,
    outputImages: [],
    promptVersion: args.promptVersion,
    status: "queued",
    requestStatus: "queued",
    phase: "queued",
    dependencyStatus: "current",
    startedAt,
    requestStartedAt: startedAt,
    slot: args.slot,
    poseIndex: args.workflow === "pose" ? args.slot : undefined,
    poseInstruction: args.poseInstruction,
    poseReferenceImage: args.poseReferenceImage,
    sourceModelImage: args.sourceModelImage,
    targetColorId: args.targetColorId,
    colorName: args.colorName,
    batchId: args.batchId,
    inpaint: args.inpaint,
    correctionPlan,
    detailReferenceImages: args.detailReferenceImages,
    garmentDetailLockVersion: args.garmentDetailLockVersion,
    tryonEditTask: args.tryonEditTask,
    detailRepairOfJobId: args.detailRepairOfJobId,
    detailRepairAttempt: args.detailRepairAttempt,
  });
  try {
    const tStart = Date.now();
    await patchJob(id, {
      status: "generating",
      requestStatus: "generating",
      phase: "uploading",
    });
    const preprocessStart = Date.now();
    const sourceBuffers = await runInOrder(args.images, localImage),
      prepared = await runInOrder(sourceBuffers, (buffer) =>
        cachedPrepare(buffer, prepareProviderInput),
      ),
      dataUrls = prepared.map((image) => toDataUrl(image.buffer, image.mime)),
      inputHashes = sourceBuffers.map(sha);
    const preprocessMs = Date.now() - preprocessStart;
    await patchJob(id, { phase: "submitting" });
    await patchJob(id, { phase: "waiting_provider" });
    const apiStartedAt = Date.now();
    let generated;
    let retryCount = 0;
    for (let attempt = 0; ; attempt++) {
      try {
        generated = await generateImage(
          {
            workflow: args.workflow,
            provider: choice.type,
            model: choice.model,
            images: dataUrls,
            prompt: args.prompt,
            mask: args.mask,
            options: {
              mode: args.mode,
              sku: project.sku,
              candidate: args.slot,
              seed,
            },
          },
          choice,
        );
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error),
          transient = isRetryableGenerationError(message);
        if (attempt >= 2 || !transient) throw error;
        retryCount = attempt + 1;
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            1500 + attempt * 2000 + Math.floor(Math.random() * 500),
          ),
        );
      }
    }
    const apiDurationMs = Date.now() - apiStartedAt;
    await patchJob(id, { phase: "downloading" });
    const downloadStart = Date.now();
    const downloaded = generated.imageBase64
      ? {
          buffer: Buffer.from(generated.imageBase64, "base64"),
          mime: generated.mimeType || "image/jpeg",
        }
      : await downloadImage(
          generated.temporaryImageUrl!,
          undefined,
          generated.trustedImageHost,
        );
    const downloadMs = Date.now() - downloadStart;
    const originalFileSize = downloaded.buffer.length;
    if (isGenerationCancelled(project.id, args.workflow)) {
      const cancelledAt = new Date().toISOString();
      await patchJob(id, {
        status: "interrupted",
        requestStatus: "interrupted",
        phase: "interrupted",
        error: "任务已被用户取消",
        errorMessage: "任务已被用户取消",
        finishedAt: cancelledAt,
        requestFinishedAt: cancelledAt,
      });
      return {
        id,
        slot: args.slot,
        error: "任务已被用户取消",
        provider: choice.name,
        providerId: choice.id,
        providerType: choice.type,
        model: choice.model,
        status: "interrupted",
      };
    }
    await patchJob(id, { phase: "validating" });
    const localStart = Date.now();
    const checks = await validateOutput(
      downloaded.buffer,
      downloaded.mime,
      inputHashes,
      args.otherHashes,
      args.workflow === "recolor" ? sourceBuffers[0] : undefined,
    );
    await patchJob(id, { phase: "optimizing" });
    const optimized = await optimizeFinalImage(downloaded.buffer);
    const localMs = Date.now() - localStart;
    await patchJob(id, { phase: "saving" });
    const url = await saveOutput(
      project.sku,
      args.folder,
      args.filename,
      optimized.buffer,
    );
    let correctionCheck;
    try {
      if (args.correctionPlan)
        correctionCheck = await checkCorrectionCommand(
          args.images[0],
          url,
          args.correctionPlan,
        );
    } catch {
      /* QC模型未配置时保留结果并交给人工审核 */
    }
    const commandFailed = Boolean(correctionCheck && !correctionCheck.passed),
      commandIssues =
        correctionCheck && !correctionCheck.passed
          ? [...correctionCheck.missed, ...correctionCheck.violations].map(
              (item) => `咒语未命中：${item}`,
            )
          : [],
      review =
        checks.needsReview || Boolean(args.correctionPlan && !correctionCheck),
      finalStatus = commandFailed
        ? ("needs_redo" as const)
        : review
          ? ("needs_review" as const)
          : ("success" as const),
      finishedAt = new Date().toISOString(),
      durationMs = Date.now() - new Date(startedAt).getTime(),
      totalMs = Date.now() - tStart,
      timing = {
        queuedMs: preprocessStart - tStart,
        preprocessMs,
        apiMs: apiDurationMs,
        downloadMs,
        localMs,
        totalMs,
      },
      qualityIssues = [
        ...checks.warnings,
        ...commandIssues,
        ...(args.correctionPlan && !correctionCheck
          ? ["咒语命中检查暂不可用，需要人工审核"]
          : []),
      ];
    await patchJob(id, {
      status: finalStatus,
      requestStatus: finalStatus,
      phase: "success",
      outputImages: [url],
      error: undefined,
      errorMessage: commandFailed
        ? `咒语强制命令未完全命中：${correctionCheck?.summary || "请查看未命中项"}`
        : undefined,
      finishedAt,
      requestFinishedAt: finishedAt,
      durationMs,
      timing,
      qualityIssues: qualityIssues.length ? qualityIssues : undefined,
      sharpnessScore: checks.sharpnessScore,
      correctionCheck,
    });
    await appendModelRunRecord({
      workflowType: args.workflow,
      providerId: choice.id,
      providerName: choice.name,
      modelId: choice.model,
      startedAt,
      completedAt: finishedAt,
      durationMs,
      success: !commandFailed,
      retryCount,
      qcResult: commandFailed ? "failed" : review ? "needs_review" : "passed",
      promptVersion: args.promptVersion,
      generationMode: args.mode,
      parameters: {
        folder: args.folder,
        slot: args.slot,
        originalFileSize,
        finalFileSize: optimized.finalSize,
        apiDurationMs,
        timing,
      },
    }).catch(() => {});
    return {
      id,
      slot: args.slot,
      url,
      provider: choice.name,
      providerId: choice.id,
      providerType: choice.type,
      model: choice.model,
      hash: sha(optimized.buffer),
      status: finalStatus,
      warnings: qualityIssues,
      originalFileSize,
      finalFileSize: optimized.finalSize,
      timing,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : "未知生成错误",
      finishedAt = new Date().toISOString(),
      durationMs = Date.now() - new Date(startedAt).getTime();
    await patchJob(id, {
      status: "failed",
      requestStatus: "failed",
      phase: "failed",
      error,
      errorMessage: error,
      finishedAt,
      requestFinishedAt: finishedAt,
      durationMs,
    });
    await appendModelRunRecord({
      workflowType: args.workflow,
      providerId: choice.id,
      providerName: choice.name,
      modelId: choice.model,
      startedAt,
      completedAt: finishedAt,
      durationMs,
      success: false,
      retryCount: 0,
      errorMessage: error,
      promptVersion: args.promptVersion,
      generationMode: args.mode,
      parameters: { folder: args.folder, slot: args.slot },
    }).catch(() => {});
    return {
      id,
      slot: args.slot,
      error,
      provider: choice.name,
      providerId: choice.id,
      providerType: choice.type,
      model: choice.model,
      status: "failed",
    };
  }
}

export async function executeTryon(v: {
  projectId: string;
  productType: ProductType;
  garmentImage: string;
  modelImage: string;
  garmentDescription: string;
  detailRequirements: string;
  extraRequirements?: string;
  face: boolean;
  mode: GenerationMode;
  candidateCount: number;
  slot?: number;
  modelPreference?: ModelSlot;
  correctionRequest?: string;
  correctionPlan?: CorrectionCommandPlan;
}) {
  const p = await getProject(v.projectId);
  if (!p) throw new Error("项目不存在");
  const choice = await resolveWorkflowModel(
    "tryon",
    v.mode,
    v.modelPreference || "primary",
  );
  const garmentSource = await resolveExistingGarmentSource(p, v.garmentImage);
  let lock: GarmentDetailLock;
  try {
    lock = await analyzeGarmentDesign(
      { ...p, productType: v.productType },
      garmentSource,
    );
  } catch (error) {
    throw new Error(
      `换装第1步 analyzeGarmentDesign 失败：${error instanceof Error ? error.message : "服装识别失败"}`,
    );
  }
  let modelAnalysis;
  try {
    modelAnalysis =
      p.tryonModelReferenceAnalysis?.sourceImage === v.modelImage
        ? p.tryonModelReferenceAnalysis
        : await analyzeModelReference(v.modelImage);
  } catch (error) {
    throw new Error(
      `换装第3步 analyzeModelReference 失败：${error instanceof Error ? error.message : "模特图识别失败"}`,
    );
  }
  const garmentRules = buildGarmentProtectionRules(lock),
    editTask = buildTryOnEditTask({ garmentRules, modelAnalysis });
  await updateProject(p.id, {
    garmentDetailLock: lock,
    tryonModelReferenceAnalysis: modelAnalysis,
  });
  const detailReferences = lock.detailReferences;
  if (detailReferences.length && ["bfl", "fashn"].includes(choice.type))
    throw new Error(
      `当前换装模型 ${choice.name} 不支持细节参考多图输入；请改用支持多图编辑的模型，不能静默忽略纽扣、口袋、面料等特写`,
    );
  await invalidate(p, "tryon");
  const optimized = await optimizePrompt({
      description: v.garmentDescription,
      details: v.detailRequirements,
    }),
    garmentDescription = optimized.description || v.garmentDescription,
    detailRequirements = optimized.details || v.detailRequirements;
  const editableDetails = normalizeTryonDetailRequirements(
    v.extraRequirements ||
      p.settings.tryon?.extraRequirements ||
      p.settings.tryon?.detailRequirements ||
      DEFAULT_DETAILS,
    800,
  );
  const correctionText = v.correctionPlan
    ? correctionCommandText(v.correctionPlan)
    : "";
  const protectedDetails = [
    composeTryonDetailRequirements(
      buildProductProtectionPrompt(v.productType, p.profile),
      buildGarmentDetailProtectedDetails(lock),
      detailRequirements,
    ),
    correctionText,
  ]
    .filter(Boolean)
    .join("\n");
  await updateProject(p.id, {
    productType: v.productType,
    status: "生成中",
    confirmedTryonImage: undefined,
    assets: v.correctionRequest
      ? p.assets
      : {
          ...p.assets,
          modelReferenceImage: v.modelImage,
          modelImage: v.modelImage,
        },
    settings: {
      ...p.settings,
      tryon: {
        mode: v.mode,
        candidateCount: v.candidateCount,
        productType: v.productType,
        garmentDescription: v.garmentDescription,
        detailRequirements: editableDetails,
        extraRequirements: editableDetails,
        protectedItems: p.settings.tryon?.protectedItems || [],
        face: v.face,
      },
    },
    stepStatuses: { ...p.stepStatuses, "2": "generating" },
  });
  const slots = v.slot
      ? [v.slot]
      : Array.from({ length: v.candidateCount }, (_, i) => i + 1),
    hashes: string[] = v.slot
      ? await existingHashes(p.id, "tryon", v.slot)
      : [];
  const firstPass = await runInOrder(slots, (slot) =>
    runTryOnEdit({
      task: editTask,
      garmentDescription,
      execute: (structuredPrompt) =>
        runOne({
          projectId: p.id,
          workflow: "tryon",
          mode: v.mode,
          modelSlot: v.modelPreference,
          images: [
            v.modelImage,
            garmentSource,
            ...detailReferences.map((reference) => reference.image),
          ],
          prompt: [structuredPrompt, protectedDetails]
            .filter(Boolean)
            .join("\n"),
          promptVersion: `${TRYON_PROMPT_VERSION}-structured-edit`,
          folder: "tryon",
          filename: `${safeSegment(p.sku)}_tryon_${String(slot).padStart(2, "0")}.jpg`,
          slot,
          otherHashes: hashes,
          detailReferenceImages: detailReferences,
          garmentDetailLockVersion: lock.version,
          tryonEditTask: editTask,
          correctionPlan: v.correctionPlan,
        }),
    }),
  );
  const results = [];
  for (const candidate of firstPass) {
    let current = candidate,
      assessment = await checkTryonCandidate(p.id, current),
      repairAttempt = 0;
    const editCapability = tryOnEditCapability(choice);
    while (
      assessment.report?.localRepairEligible &&
      current.id &&
      current.url &&
      editCapability !== "tryon_only" &&
      repairAttempt < 2
    ) {
      repairAttempt += 1;
      let mask: string | undefined;
      if (editCapability === "masked_edit") {
        try {
          mask = await createTryOnLocalRepairMask(
            current.url,
            assessment.report.repairTargets,
          );
        } catch (error) {
          await patchJob(current.id, {
            qualityIssues: uniqueStrings([
              ...((await getJob(current.id))?.qualityIssues || []),
              `局部修复蒙版创建失败：${error instanceof Error ? error.message : "未知错误"}`,
            ]),
          });
          break;
        }
      }
      const repaired = await runLocalRepair({
        task: editTask,
        targets: assessment.report.repairTargets,
        attempt: repairAttempt,
        hasMask: Boolean(mask),
        execute: (repairPrompt) =>
          runOne({
            projectId: p.id,
            workflow: "tryon",
            mode: v.mode,
            modelSlot: v.modelPreference,
            images: [
              current.url!,
              garmentSource,
              ...detailReferences.map((reference) => reference.image),
            ],
            mask,
            prompt: [repairPrompt, correctionText].filter(Boolean).join("\n"),
            promptVersion: `${TRYON_PROMPT_VERSION}-local-repair-${repairAttempt}`,
            folder: "tryon/local-repair",
            filename: `${safeSegment(p.sku)}_tryon_${String(current.slot || 1).padStart(2, "0")}_local_repair_${repairAttempt}.jpg`,
            slot: current.slot || 1,
            otherHashes: hashes,
            detailReferenceImages: detailReferences,
            garmentDetailLockVersion: lock.version,
            tryonEditTask: editTask,
            detailRepairOfJobId: current.id,
            detailRepairAttempt: repairAttempt,
            correctionPlan: v.correctionPlan,
          }),
      });
      if (!repaired.url) {
        if (repaired.id) await patchJob(repaired.id, { slot: undefined });
        await patchJob(current.id, {
          qualityIssues: uniqueStrings([
            ...((await getJob(current.id))?.qualityIssues || []),
            `第${repairAttempt}轮局部修复失败，已保留原候选和真实错误`,
          ]),
        });
        break;
      }
      current = repaired;
      assessment = await checkTryonCandidate(p.id, current);
    }
    results.push(current);
  }
  const expected = v.slot
      ? p.settings.tryon?.candidateCount || v.candidateCount
      : v.candidateCount,
    latestJobs = await latestSlotJobs(p.id, "tryon"),
    valid = Array.from(latestJobs.values()).filter((job) =>
      ["success", "needs_review", "confirmed"].includes(job.status),
    ).length,
    needsRedo = Array.from(latestJobs.values()).some(
      (job) => job.status === "needs_redo",
    ),
    status = valid
      ? slotState(latestJobs, expected)
      : needsRedo
        ? "needs_redo"
        : "failed",
    latest = await getProject(p.id);
  if (!latest) throw new Error("项目不存在");
  await updateProject(p.id, tryonCompletionPatch(latest, status));
  return results;
}

async function checkTryonCandidate(
  projectId: string,
  candidate: { id?: string; url?: string; status?: string; slot?: number },
) {
  if (!candidate.id || !candidate.url || candidate.status === "failed")
    return { report: undefined };
  const project = await getProject(projectId),
    job = await getJob(candidate.id);
  if (!project || !job) return { report: undefined };
  const generatedStatus = job.status;
  try {
    // 图片已经保存，可以立即展示；此时明确告诉页面正在做视觉质检，避免
    // 用户误以为上游模型仍然没有出图。
    await patchJob(job.id, {
      status: "generating",
      requestStatus: "generating",
      phase: "validating",
    });
    const { report, subject, garment } = await runTryOnConsistencyCheck(
      project,
      job,
    );
    const issues = uniqueStrings([
      ...(job.qualityIssues || []),
      ...report.issues.map((issue) => `换装一致性：${issue}`),
      ...(report.status === "needs_redo" && !report.localRepairEligible
        ? ["错误涉及人物、构图、整体结构或缺少可靠坐标，禁止用局部修复掩盖问题"]
        : []),
    ]);
    await patchJob(job.id, {
      subjectFidelity: subject,
      consistencyCheck: garment,
      tryonConsistency: report,
      ...(subject.status === "failed"
        ? { ...tryonSubjectFidelityFailurePatch(), phase: "success" as const }
        : report.status === "needs_redo"
          ? {
              status: "needs_redo",
              requestStatus: "needs_redo",
              phase: "success",
              errorMessage: `换装一致性未通过：${report.summary}`,
              qualityIssues: issues,
            }
          : report.status === "needs_review"
            ? {
                status: "needs_review",
                requestStatus: "needs_review",
                phase: "success",
                qualityIssues: issues,
              }
            : {
                status: generatedStatus,
                requestStatus: generatedStatus,
                phase: "success",
                qualityIssues: issues.length ? issues : undefined,
              }),
    });
    return { report };
  } catch (error) {
    await patchJob(job.id, {
      status: "needs_review",
      requestStatus: "needs_review",
      phase: "success",
      qualityIssues: [
        ...(job.qualityIssues || []),
        `换装一致性自动校验不可用：${error instanceof Error ? error.message : "未知错误"}`,
      ],
    });
    return { report: undefined };
  }
}

async function autoCheckRecolorConsistency(
  projectId: string,
  results: Array<{ id?: string; url?: string; status?: string }>,
) {
  const candidates = results.filter(
    (result) => result.id && result.url && result.status !== "failed",
  );
  if (!candidates.length) return;
  const project = await getProject(projectId);
  if (!project) return;
  await runInOrder(candidates, async (candidate) => {
    const job = await getJob(candidate.id!);
    if (!job || !job.outputImages.length) return;
    try {
      const check = await checkGarmentConsistency(project, job);
      const issues =
        check.status === "passed"
          ? job.qualityIssues
          : [
              ...(job.qualityIssues || []),
              ...check.issues.map((issue) => `复色校验：${issue}`),
            ];
      await patchJob(job.id, {
        consistencyCheck: check,
        ...(check.status === "failed"
          ? {
              status: "failed",
              requestStatus: "failed",
              phase: "failed",
              error: `自动复色校验失败：${check.summary}`,
              errorMessage: `自动复色校验失败：${check.summary}`,
              qualityIssues: issues,
            }
          : check.status === "needs_review"
            ? {
                status: "needs_review",
                requestStatus: "needs_review",
                qualityIssues: issues,
              }
            : {}),
      });
    } catch {
      /* QC 模型未配置时保留生成结果，页面仍允许人工逐款质检 */
    }
  });
}

export async function executePose(v: {
  projectId: string;
  sourceImage: string;
  poseReferenceImages: string[];
  referenceMode: "library" | "upload";
  mode: GenerationMode;
  shotType: string;
  face: boolean;
  background: boolean;
  detailRequirements: string;
  poseInstructions?: string[];
  focus?: "upper" | "lower";
  slot?: number;
  modelPreference?: ModelSlot;
  correctionPlan?: CorrectionCommandPlan;
}) {
  const p = await getProject(v.projectId);
  if (!p) throw new Error("项目不存在");
  const choice = await resolveWorkflowModel(
    "pose",
    v.mode,
    v.modelPreference || "primary",
  );
  if (["bfl", "fashn"].includes(choice.type))
    throw new Error(
      `当前模型 ${choice.name} 不支持“商品图＋姿势参考图”的多图编辑，请在模型设置中选择支持多图参考的模型`,
    );
  if (
    v.poseReferenceImages.length !== 3 ||
    v.poseReferenceImages.some((image) => !image)
  )
    throw new Error("请先准备姿势01、姿势02、姿势03三张参考图");
  await invalidate(p, "pose");
  const optimized = await optimizePrompt({ details: v.detailRequirements }),
    detailRequirements = optimized.details || v.detailRequirements;
  const correctionText = v.correctionPlan
    ? correctionCommandText(v.correctionPlan)
    : "";
  const instructions =
      v.poseInstructions?.length === 3
        ? v.poseInstructions
        : POSE_PRESETS[p.productType],
    baseProtectedDetails = normalizeTryonDetailRequirements(
      `${buildProductProtectionPrompt(p.productType, p.profile)}\n${detailRequirements}`,
      2000,
    ),
    protectedDetails = [baseProtectedDetails, correctionText]
      .filter(Boolean)
      .join("\n"),
    slots = v.slot ? [v.slot] : [1, 2, 3],
    hashes: string[] = v.slot ? await existingHashes(p.id, "pose", v.slot) : [];
  await updateProject(p.id, {
    status: "生成中",
    settings: {
      ...p.settings,
      pose: {
        mode: v.mode,
        productType: p.productType,
        shotType: v.shotType,
        face: v.face,
        background: v.background,
        detailRequirements: protectedDetails,
        poseInstructions: instructions,
        sourceMode:
          p.assets.standalonePoseInputImage === v.sourceImage
            ? "standalone"
            : "confirmed",
        referenceMode: v.referenceMode,
        focus: v.focus,
      },
    },
    poseReviewStates: v.slot
      ? { ...p.poseReviewStates, [String(v.slot)]: "pending" }
      : { "1": "pending", "2": "pending", "3": "pending" },
    stepStatuses: { ...p.stepStatuses, "3": "generating" },
  });
  const slotKey = `${choice.id}:${choice.model}`;
  const garmentSource = p.assets.garmentImage;
  const hasGarmentSource = Boolean(garmentSource);
  const batchId = crypto.randomUUID();
  const results = await Promise.all(
    slots.map(async (slot) => {
      const instruction = instructions[slot - 1],
        reference = v.poseReferenceImages[slot - 1];
      const release = await acquireProviderSlot(slotKey, 1);
      try {
        return await runOne({
          projectId: p.id,
          workflow: "pose",
          mode: v.mode,
          modelSlot: v.modelPreference,
          images: poseInputImages(v.sourceImage, reference, garmentSource),
          prompt: posePrompt(
            instruction,
            p.productType,
            v.shotType,
            v.face,
            v.background,
            protectedDetails,
            hasGarmentSource,
            v.focus,
          ),
          promptVersion: POSE_PROMPT_VERSION,
          folder: "pose",
          filename: `${safeSegment(p.sku)}_original_pose${String(slot).padStart(2, "0")}.jpg`,
          slot,
          otherHashes: hashes,
          poseInstruction: instruction,
          poseReferenceImage: reference,
          sourceModelImage: v.sourceImage,
          batchId,
          correctionPlan: v.correctionPlan,
        });
      } finally {
        release();
      }
    }),
  );
  const status = slotState(await latestSlotJobs(p.id, "pose"), 3);
  await updateProject(p.id, {
    status: status === "failed" ? "生成失败" : "等待人工确认",
    stepStatuses: { ...p.stepStatuses, "3": status },
  });
  return results;
}

export async function executeRecolor(v: {
  projectId: string;
  colorReferenceImage: string;
  colorReferenceCrop?: string;
  colorName: string;
  targetColorId?: string;
  hexColor: string;
  garmentArea: string;
  protectedAreas: string[];
  extraRequirements: string;
  face: boolean;
  mode: GenerationMode;
  sourceMode?: "confirmed" | "standalone";
  poseImages?: string[];
  sourceOverride?: "correction";
  withModelImage?: boolean;
  variantDesignDetails?: string[];
  variantMaterialFeatures?: string;
  variantColorRegions?: Array<{
    part: string;
    colorName: string;
    hex?: string;
    confidence: number;
  }>;
  variantUniformColor?: boolean;
  variantUniformColorConfidence?: number;
  variantOcclusion?: "none" | "partial" | "heavy";
  variantOcclusionPolicy?: "visible_only" | "extend_uniform";
  variantOcclusionReason?: string;
  variantStructureMode?: RecolorStructureMode;
  variantStructureDifferences?: string[];
  variantStructureDifferenceConfidence?: number;
  recolorMode?: "uniform" | "perVariant";
  slot?: number;
  modelPreference?: ModelSlot;
  correctionPlan?: CorrectionCommandPlan;
}) {
  const p = await getProject(v.projectId);
  if (!p) throw new Error("项目不存在");
  const choice = await resolveWorkflowModel(
    "recolor",
    v.mode,
    v.modelPreference || "primary",
  );
  const optimized = await optimizePrompt({ details: v.extraRequirements }),
    extraRequirements = optimized.details || v.extraRequirements;
  const savedExtra = normalizeTryonDetailRequirements(
    v.extraRequirements,
    2000,
  );
  const correctionText = v.correctionPlan
    ? correctionCommandText(v.correctionPlan)
    : "";
  const sourceMode =
      v.sourceMode ||
      (p.confirmedPoseImages?.length ? "confirmed" : "standalone"),
    protectedDetails = [
      normalizeTryonDetailRequirements(
        `${buildProductProtectionPrompt(p.productType, p.profile)}\n${extraRequirements}`,
        3000,
      ),
      correctionText,
    ]
      .filter(Boolean)
      .join("\n"),
    sources =
      v.sourceOverride === "correction" && v.poseImages?.length
        ? v.poseImages
        : sourceMode === "confirmed"
          ? (p.confirmedPoseImages || []).concat(
              v.withModelImage && p.confirmedTryonImage
                ? [p.confirmedTryonImage]
                : [],
            )
          : v.poseImages;
  if (!sources || sources.length < 2 || sources.length > 4)
    throw new Error(
      sourceMode === "confirmed"
        ? "请先确认上一流程的姿势图，再开始复色"
        : "请提供两张至四张有效姿势图（建议三至四张）",
    );
  const targetId = v.targetColorId || crypto.randomUUID(),
    slots = v.slot
      ? [v.slot]
      : Array.from({ length: sources.length }, (_, index) => index + 1),
    hashes: string[] = v.slot
      ? await existingHashes(p.id, "recolor", v.slot)
      : [],
    previousColor = (p.targetColors || []).find((item) => item.id === targetId),
    generationStartedAt =
      v.slot && previousColor?.generationStartedAt
        ? previousColor.generationStartedAt
        : new Date().toISOString(),
    colorSemantics = parseColorName(v.colorName),
    colorNameRule = colorNameRuleText(colorSemantics);
  const color: TargetColor = {
    id: targetId,
    name: v.colorName,
    hex: v.hexColor || undefined,
    cropImage: v.colorReferenceCrop,
    status: "generating",
    generationStartedAt,
    sourceCount: sources.length,
    protectedAreas: v.protectedAreas,
  };
  await updateProjectWith(p.id, (current) => {
    const colors = [...(current.targetColors || [])],
      colorIndex = colors.findIndex((c) => c.id === targetId);
    if (colorIndex >= 0)
      colors[colorIndex] = { ...colors[colorIndex], ...color };
    else colors.push(color);
    return {
      status: "生成中",
      targetColors: colors,
      settings: {
        ...current.settings,
        recolor: {
          mode: v.mode,
          garmentArea: v.garmentArea,
          protectedAreas: v.protectedAreas,
          extraRequirements: savedExtra,
          activeColorId: targetId,
          sourceMode,
          face: v.face,
          recolorMode: "perVariant",
        },
      },
      stepStatuses: { ...current.stepStatuses, "4": "generating" },
    };
  });
  const slotKey = `${choice.id}:${choice.model}`;
  const results = await Promise.all(
    slots.map(async (slot) => {
      const source = sources[slot - 1];
      if (!source)
        return { slot, status: "failed" as const, error: "对应姿势图不存在" };
      const colorSample = v.colorReferenceCrop || v.colorReferenceImage;
      const refs = colorSample ? [source, colorSample] : [source];
      const trim = v as typeof v & { trimColorName?: string; trimHex?: string };
      const release = await acquireProviderSlot(slotKey, 1);
      try {
        return await runOne({
          projectId: p.id,
          workflow: "recolor",
          mode: v.mode,
          modelSlot: v.modelPreference,
          images: refs,
          prompt: recolorPrompt(
            v.garmentArea,
            v.colorName,
            v.hexColor,
            v.protectedAreas,
            protectedDetails,
            v.face,
            trim.trimColorName,
            trim.trimHex,
            v.variantDesignDetails,
            v.variantMaterialFeatures,
            colorNameRule,
            "perVariant",
            v.variantColorRegions,
            v.variantUniformColor,
            v.variantUniformColorConfidence,
            v.variantOcclusion,
            v.variantOcclusionPolicy,
            v.variantOcclusionReason,
            v.variantStructureMode,
            v.variantStructureDifferences,
            v.variantStructureDifferenceConfidence,
          ),
          promptVersion: RECOLOR_PROMPT_VERSION,
          folder: `recolor/${safeSegment(v.colorName)}`,
          filename: `${safeSegment(p.sku)}_${safeSegment(v.colorName)}_pose${String(slot).padStart(2, "0")}.jpg`,
          slot,
          otherHashes: hashes,
          targetColorId: targetId,
          colorName: v.colorName,
          correctionPlan: v.correctionPlan,
        });
      } finally {
        release();
      }
    }),
  );
  await autoCheckRecolorConsistency(p.id, results);
  const latestBySlot = await latestSlotJobs(p.id, "recolor", targetId),
    urls = Array.from({ length: sources.length }, (_, index) => {
      const job = latestBySlot.get(index + 1);
      return job &&
        ["success", "needs_review", "confirmed"].includes(job.status)
        ? job.outputImages[0]
        : undefined;
    }).filter((url): url is string => Boolean(url)),
    stepState = slotState(latestBySlot, sources.length),
    colorState = stepState === "awaiting_confirmation" ? "success" : stepState,
    collectionState =
      urls.length === 0
        ? "failed"
        : urls.length < sources.length
          ? "partial_success"
          : "completed";
  await updateProjectWith(p.id, (current) => ({
    currentStep: urls.length
      ? Math.max(current.currentStep, 5)
      : current.currentStep,
    status: urls.length
      ? "等待最终确认"
      : current.status === "生成中"
        ? "生成失败"
        : current.status,
    dependencyStatus: urls.length ? "current" : current.dependencyStatus,
    targetColors: (current.targetColors || []).map((c) =>
      c.id === targetId
        ? ({
            ...c,
            status: colorState,
            sourceCount: sources.length,
            poseResults: urls,
          } as TargetColor)
        : c,
    ),
    stepStatuses: {
      ...current.stepStatuses,
      "4": collectionState,
      "5": urls.length ? "ready" : current.stepStatuses?.["5"] || "not_started",
    },
  }));
  return results;
}

export async function executeInpaint(v: {
  projectId: string;
  sourceImageId: string;
  sourceStep: WorkflowType;
  sourceUrl: string;
  maskUrl?: string;
  maskDataUrl?: string;
  editPrompt: string;
  contextHint?: string;
  mode: GenerationMode;
  slot?: number;
  modelPreference?: ModelSlot;
}) {
  const p = await getProject(v.projectId);
  if (!p) throw new Error("项目不存在");
  const storedMask = v.maskUrl,
    mask = storedMask
      ? toDataUrl(await localImage(storedMask), "image/png")
      : v.maskDataUrl;
  if (!mask) throw new Error("局部重绘选区不存在，请重新涂抹");
  const inpaintMeta: InpaintMeta = {
    sourceImageId: v.sourceImageId,
    sourceStep: v.sourceStep,
    sourceUrl: v.sourceUrl,
    maskUrl: storedMask || "旧版任务内嵌蒙版",
    editPrompt: v.editPrompt,
  };
  const slot = v.slot || 1,
    filename = `${safeSegment(p.sku)}_inpaint_${String(slot).padStart(2, "0")}_${crypto.randomUUID().slice(0, 8)}.jpg`;
  const result = await runOne({
    projectId: p.id,
    workflow: "inpaint",
    mode: v.mode,
    modelSlot: v.modelPreference,
    images: [v.sourceUrl],
    mask,
    prompt: inpaintPrompt(
      v.editPrompt,
      v.contextHint || contextHintForStep(v.sourceStep),
    ),
    promptVersion: INPAINT_PROMPT_VERSION,
    folder: "inpaint",
    filename,
    slot,
    inpaint: inpaintMeta,
  });
  return [result];
}

function contextHintForStep(step: WorkflowType) {
  if (step === "tryon")
    return "这是服装换装结果图。局部修改时仍须保持产品服装的整体设计逻辑、面料纹理、版型和细节一致，只改用户选中的局部区域。";
  if (step === "pose")
    return "这是三姿势结果图。局部修改时仍须保持该姿势、人物和景别不变，只改用户选中的局部区域。";
  if (step === "recolor")
    return "这是复色结果图。局部修改时仍须保持复色后的整体颜色样式、面料纹理和设计一致，只改用户选中的局部区域。";
  return "局部修改时仍须保持原图的人物、姿势、景别、构图和整体样式不变，只改用户选中的局部区域。";
}

export const invalidateForAssetChange = async (
  projectId: string,
  key: string,
) => {
  const p = await getProject(projectId);
  if (!p) return;
  const jobs = await listJobs({ projectId });
  const garmentDetailKeys = [
    "productFrontImage",
    "productBackImage",
    "productDetailImage",
    "printCloseupImage",
    "buttonCloseupImage",
    "pocketCloseupImage",
    "necklineCloseupImage",
    "sleeveCloseupImage",
    "hemCloseupImage",
    "stitchingCloseupImage",
    "fabricTextureImage",
  ];
  if (
    ["garmentImage", "modelReferenceImage", ...garmentDetailKeys].includes(key)
  ) {
    if (
      p.confirmedTryonImage ||
      jobs.some((j) => j.workflow === "pose" || j.workflow === "recolor")
    )
      await invalidate(p, "tryon");
    else
      await updateProject(p.id, {
        stepStatuses: { ...p.stepStatuses, "2": "ready" },
      });
  } else if (
    ["standalonePoseInputImage", "poseReferenceImages"].includes(key)
  ) {
    if (p.confirmedPoseImages || jobs.some((j) => j.workflow === "recolor"))
      await invalidate(p, "pose");
    else
      await updateProject(p.id, {
        stepStatuses: { ...p.stepStatuses, "3": "ready" },
      });
  } else if (
    ["colorReferenceImage", "standaloneRecolorPoseImages"].includes(key)
  ) {
    if ((p.targetColors || []).some((c) => c.poseResults?.length))
      await invalidate(p, "color");
    else
      await updateProject(p.id, {
        stepStatuses: { ...p.stepStatuses, "4": "ready" },
      });
  }
};
