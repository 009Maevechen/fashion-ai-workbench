import "server-only";
import crypto from "node:crypto";
import path from "node:path";
import { createProject, getProject, listProjects, updateProject, type GarmentDetailLock, type Project, type TargetColor } from "./db";
import { analyzeGarmentDesign } from "./ai/garment-detail-lock";
import { getIndexedImage, indexLocalImage, indexedImageUrl, saveIndexedGarmentAnalysis, type ImageIndexEntry } from "./image-index";
import { listInventory, recommendGroups } from "./pose-inventory";
import { parseTableDocument } from "./table-parse";
import {
  normalizeSkuRow,
  operationalProductType,
  type ColorVariantBinding,
  type GarmentProductionProfile,
  type IndexedImageType,
  type NormalizedSkuRow,
  type ProjectImageRefs,
  type SkuProductionTask,
} from "./sku-production";
import {
  addSpreadsheetImport,
  createImportIdentity,
  type SpreadsheetImportRecord,
  type SpreadsheetImportRowResult,
} from "./spreadsheet-import-store";

type IndexedByRole = Record<IndexedImageType, ImageIndexEntry[]>;

async function indexRowImages(row: NormalizedSkuRow, baseDirectory?: string): Promise<IndexedByRole> {
  const roles: Array<[IndexedImageType, string[]]> = [
    ["product", row.productImagePaths],
    ["model", row.modelImagePaths],
    ["pose", row.poseImagePaths],
    ["color", row.colorImagePaths],
    ["supplemental", row.supplementalImagePaths],
  ];
  const result = { product: [], model: [], pose: [], color: [], supplemental: [] } as IndexedByRole;
  for (const [type, paths] of roles) {
    for (const filePath of paths) result[type].push(await indexLocalImage({ sku: row.sku, filePath, type, baseDirectory }));
  }
  return result;
}

function refsFromIndexed(images: IndexedByRole): ProjectImageRefs {
  return {
    product: images.product.map((item) => item.imageId),
    model: images.model.map((item) => item.imageId),
    pose: images.pose.map((item) => item.imageId),
    color: images.color.map((item) => item.imageId),
    supplemental: images.supplemental.map((item) => item.imageId),
  };
}

function colorData(row: NormalizedSkuRow, indexed: IndexedByRole, existing: Project): { colors: TargetColor[]; bindings: ColorVariantBinding[] } {
  const currentByName = new Map((existing.targetColors || []).map((item) => [(item.userConfirmedName || item.name).trim().toLocaleLowerCase(), item]));
  const oneToOne = row.colors.length > 0 && row.colors.length === indexed.color.length;
  const colors = row.colors.map((name, index) => {
    const current = currentByName.get(name.toLocaleLowerCase());
    if (current?.manualReviewConfirmed || current?.userConfirmedName || current?.userConfirmedHex) return current;
    const image = oneToOne ? indexed.color[index] : undefined;
    const reference = image ? {
      id: image.imageId,
      path: indexedImageUrl(image.imageId),
      hash: image.hash,
      role: "primary" as const,
      isPrimary: true,
      fileName: path.basename(image.filePath),
      uploadedAt: image.updatedAt,
    } : undefined;
    return {
      ...(current || {}),
      id: current?.id || crypto.randomUUID(),
      name,
      referenceImages: reference ? [reference] : current?.referenceImages,
      primaryReferenceId: reference?.id || current?.primaryReferenceId,
      referenceNeedsReview: indexed.color.length > 0 && !oneToOne,
      status: current?.status || "draft",
    } satisfies TargetColor;
  });
  const bindings = colors.map((color, index) => ({
    id: color.id,
    name: color.userConfirmedName || color.name,
    primaryImageId: oneToOne ? indexed.color[index]?.imageId : undefined,
    supportingImageIds: [],
    needsReview: Boolean(indexed.color.length && !oneToOne),
    manualConfirmed: Boolean(color.manualReviewConfirmed || color.userConfirmedName || color.userConfirmedHex),
  }));
  return { colors, bindings };
}

async function poseRecommendations(row: NormalizedSkuRow) {
  const manifest = await listInventory();
  return recommendGroups(manifest.groups, {
    productType: operationalProductType(row.garmentProfile),
    productSubtype: row.garmentProfile.secondaryCategory,
  }).filter((item) => item.score > 0).slice(0, 3).map((item) => ({
    groupId: item.group.poseGroupId,
    poseGroupId: item.group.poseGroupId,
    score: item.score,
    reasons: item.reasons,
  }));
}

function mergeIssues(row: NormalizedSkuRow, indexed: IndexedByRole) {
  const issues = [...row.issues];
  for (const image of Object.values(indexed).flat()) if (!image.exists) issues.push(`图片路径失效：${image.filePath}`);
  if (row.colors.length && indexed.color.length && row.colors.length !== indexed.color.length) issues.push("颜色名称数量与颜色参考图数量不一致，需要人工绑定");
  if (row.designLevel === "complex" && row.colors.length && indexed.color.length < row.colors.length) issues.push("复杂款必须为每个颜色款绑定对应参考图后再复色");
  return [...new Set(issues)];
}

export async function importSkuSpreadsheet(buffer: Buffer, fileName: string, baseDirectory?: string): Promise<SpreadsheetImportRecord> {
  const document = await parseTableDocument(buffer, fileName);
  if (!document.rows.length) throw new Error("表格中没有有效商品数据行");
  const identity = createImportIdentity(fileName, buffer);
  const projects = await listProjects();
  const bySku = new Map(projects.map((project) => [project.sku.trim().toLocaleLowerCase(), project]));
  const results: SpreadsheetImportRowResult[] = [];
  let createdCount = 0, updatedCount = 0, failedCount = 0;

  for (let index = 0; index < document.rows.length; index++) {
    const row = normalizeSkuRow(document.rows[index], index + 2);
    if (!row.sku) {
      results.push({ rowNumber: row.rowNumber, status: "skipped", issues: row.issues });
      failedCount++;
      continue;
    }
    try {
      let project = bySku.get(row.sku.toLocaleLowerCase());
      const existed = Boolean(project);
      if (!project) {
        project = await createProject({ sku: row.sku, productName: row.productName, productType: operationalProductType(row.garmentProfile) });
        bySku.set(row.sku.toLocaleLowerCase(), project);
      }
      const indexed = await indexRowImages(row, baseDirectory);
      const issues = mergeIssues(row, indexed);
      const recommendedPoses = await poseRecommendations(row);
      const task: SkuProductionTask = {
        taskId: project.productionTask?.taskId || crypto.randomUUID(),
        taskTypes: row.taskTypes,
        designLevel: row.designLevel,
        requirements: row.requirements,
        notes: row.notes,
        status: issues.length ? "needs_review" : "draft",
        recommendedPoses,
        issues,
        createdAt: project.productionTask?.createdAt || identity.importedAt,
        updatedAt: identity.importedAt,
      };
      const { colors, bindings } = colorData(row, indexed, project);
      const first = (role: IndexedImageType) => indexed[role][0] ? indexedImageUrl(indexed[role][0].imageId) : undefined;
      const updated = await updateProject(project.id, {
        productName: project.sourceMode === "manual" && project.productName ? project.productName : row.productName,
        productType: operationalProductType(row.garmentProfile),
        sourceMode: "spreadsheet",
        spreadsheetSource: { importId: identity.id, fileName, sheetName: document.sheetName, rowNumber: row.rowNumber, importedAt: identity.importedAt },
        sourceImageRefs: refsFromIndexed(indexed),
        garmentProfile: project.garmentProfile?.source === "manual" ? project.garmentProfile : row.garmentProfile,
        productionTask: task,
        colorVariantBindings: bindings,
        targetColors: colors.length ? colors : project.targetColors,
        assets: {
          ...project.assets,
          garmentImage: first("product") || project.assets.garmentImage,
          modelReferenceImage: first("model") || project.assets.modelReferenceImage,
          modelImage: first("model") || project.assets.modelImage,
          poseReferenceImages: indexed.pose.length ? indexed.pose.slice(0, 3).map((item) => indexedImageUrl(item.imageId)) : project.assets.poseReferenceImages,
          colorReferenceImage: first("color") || project.assets.colorReferenceImage,
          otherMaterialImages: indexed.supplemental.length ? indexed.supplemental.map((item) => indexedImageUrl(item.imageId)) : project.assets.otherMaterialImages,
        },
        status: task.status === "draft" ? "等待商品 AI 分析" : "需要人工确认表格",
      });
      project = updated;
      if (existed) updatedCount++;
      else createdCount++;
      results.push({ rowNumber: row.rowNumber, sku: row.sku, projectId: project.id, taskId: task.taskId, status: existed ? "updated" : "created", issues });
    } catch (error) {
      failedCount++;
      results.push({ rowNumber: row.rowNumber, sku: row.sku, status: "failed", issues: [error instanceof Error ? error.message : "导入失败"] });
    }
  }
  const record: SpreadsheetImportRecord = {
    ...identity,
    sheetName: document.sheetName,
    rowCount: document.rows.length,
    createdCount,
    updatedCount,
    failedCount,
    status: failedCount === document.rows.length ? "failed" : failedCount ? "partial" : "completed",
    rows: results,
  };
  return addSpreadsheetImport(record);
}

const value = (lock: GarmentDetailLock, key: keyof GarmentDetailLock["fields"]) => {
  const item = lock.fields[key];
  return item.visibility === "visible" ? item.value : undefined;
};

export function garmentProfileFromLock(lock: GarmentDetailLock, previous?: GarmentProductionProfile): GarmentProductionProfile {
  const detected = normalizeSkuRow({ 商品名称: `${value(lock, "category") || ""} ${value(lock, "subcategory") || ""}` }, 1).garmentProfile;
  const category = previous?.source === "manual" ? previous : { ...detected, confidence: Math.max(detected.confidence, previous?.confidence || 0.5) };
  return {
    ...category,
    secondaryCategory: value(lock, "subcategory") || category.secondaryCategory,
    fit: value(lock, "fit"), silhouette: value(lock, "silhouette"), length: value(lock, "length"),
    neckline: value(lock, "neckline"), sleeve: value(lock, "sleeve"), hem: value(lock, "hem"),
    texture: value(lock, "fabricTexture"), gloss: value(lock, "fabricGloss"), drape: value(lock, "drape"),
    buttonCount: value(lock, "buttonCount"), buttonPosition: value(lock, "buttonPosition"),
    pocketCount: value(lock, "pocketCount"), pocketPosition: value(lock, "pocketPosition"),
    stripes: [value(lock, "stripeCount"), value(lock, "stripePosition")].filter(Boolean).join("；") || undefined,
    print: value(lock, "print"), paneling: value(lock, "paneling"), trim: value(lock, "trim"),
    specialDesign: [value(lock, "embroidery"), value(lock, "drawstring"), value(lock, "waistband"), value(lock, "slit"), value(lock, "otherDetails")].filter(Boolean).join("；") || undefined,
    protectedDetails: lock.protectedDetails,
    forbiddenChanges: ["不得改变服装类别、版型、长度、面料和结构", "不得新增或删除产品图已有细节", "不得混入模特原服装特征"],
    riskWarnings: lock.issues,
    confidence: Math.min(...Object.values(lock.fields).filter((item) => item.visibility === "visible").map((item) => item.confidence), 1),
    source: "ai",
    analyzedAt: lock.lockedAt,
    model: lock.model,
  };
}

export async function analyzeSpreadsheetProject(projectId: string) {
  const project = await getProject(projectId);
  if (!project) throw new Error("SKU 项目不存在");
  const source = project.assets.garmentEnhancedImage || project.assets.garmentImage;
  if (!source) throw new Error("表格未提供可读取的产品服装图");
  const indexedId = project.sourceImageRefs?.product[0];
  const cached = indexedId ? (await getIndexedImage(indexedId))?.garmentAnalysis : undefined;
  const lock = cached?.lock || await analyzeGarmentDesign(project, source);
  const garmentProfile = cached?.profile || garmentProfileFromLock(lock, project.garmentProfile);
  if (indexedId && !cached) await saveIndexedGarmentAnalysis(indexedId, { lock, profile: garmentProfile, analyzedAt: new Date().toISOString() });
  const designLevel = /条纹|印花|刺绣|拼接|包边|扣|不对称|色块/.test(`${lock.protectedDetails.join(" ")} ${Object.values(lock.fields).map((item) => item.value).join(" ")}`) ? "complex" as const : "simple" as const;
  return updateProject(project.id, {
    garmentDetailLock: lock,
    garmentProfile,
    productType: operationalProductType(garmentProfile),
    productionTask: project.productionTask ? {
      ...project.productionTask,
      designLevel,
      status: lock.status === "locked" && !project.productionTask.issues.length ? "ready" : "needs_review",
      issues: [...new Set([...project.productionTask.issues.filter((issue) => !issue.includes("款式复杂度")), ...lock.issues])],
      updatedAt: new Date().toISOString(),
    } : undefined,
    status: lock.status === "locked" ? "待确认生产方案" : "需要人工确认服装分析",
  });
}
