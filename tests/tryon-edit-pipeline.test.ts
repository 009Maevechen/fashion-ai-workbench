import assert from "node:assert/strict";
import test from "node:test";
import type {
  GarmentConsistencyCheck,
  GarmentDetailLock,
  TryonSubjectFidelityCheck,
} from "../src/lib/db";
import { GARMENT_DETAIL_FIELD_KEYS } from "../src/lib/garment-detail-lock";
import {
  buildGarmentProtectionRules,
  buildTryOnEditTask,
  resolveTryOnConsistencyReport,
  tryOnEditTaskPrompt,
  type ModelReferenceAnalysis,
} from "../src/lib/tryon-edit-pipeline";

function garmentLock(): GarmentDetailLock {
  const fields = Object.fromEntries(
    GARMENT_DETAIL_FIELD_KEYS.map((key) => [
      key,
      {
        value: key === "buttonCount" ? "3颗" : `${key}已确认`,
        confidence: key === "embroidery" ? 0.4 : 0.96,
        visibility: key === "embroidery" ? "not_visible" : "visible",
        sourceRoles: ["garment_primary"],
      },
    ]),
  ) as GarmentDetailLock["fields"];
  return {
    version: "garment-detail-lock-v2",
    status: "needs_review",
    sourceImage: "/api/files/garment.jpg",
    sourceSignature: "source",
    productType: "上衣",
    fields,
    protectedDetails: ["三颗圆形黑扣必须保持"],
    detailReferences: [],
    issues: ["刺绣不可见，需要人工确认"],
    lockedAt: "2026-09-09T00:00:00.000Z",
  };
}

const modelAnalysis: ModelReferenceAnalysis = {
  version: "tryon-model-analysis-v1",
  sourceImage: "/api/files/model.jpg",
  personIdentity: "保持同一位参考模特",
  pose: "正面自然站立，右手下垂",
  bodyProportions: "保持原图比例",
  shotType: "全身",
  composition: "人物居中，上下留白不变",
  cameraAngle: "平视正面",
  background: "浅灰影棚背景",
  lighting: "左前方柔光",
  skinTone: "自然肤色与真实皮肤纹理",
  hairstyle: "深色长发",
  faceVisibility: "visible",
  protectedSceneDetails: ["鞋子保持不变"],
  needsReview: [],
  analyzedAt: "2026-09-09T00:00:00.000Z",
};

function subject(
  patch: Partial<TryonSubjectFidelityCheck> = {},
): TryonSubjectFidelityCheck {
  return {
    status: "passed",
    basedOnModel: true,
    poseMatch: true,
    shotMatch: true,
    compositionMatch: true,
    cameraAngleMatch: true,
    backgroundMatch: true,
    lightingMatch: true,
    faceVisibilityMatch: true,
    closerToProduct: false,
    productPersonLeak: false,
    originalGarmentLeak: false,
    skinQualityMatch: true,
    artificialArtifacts: false,
    score: 96,
    summary: "人物与画面一致",
    issues: [],
    checkedAt: "",
    ...patch,
  };
}

function garment(
  patch: Partial<GarmentConsistencyCheck> = {},
): GarmentConsistencyCheck {
  return {
    status: "passed",
    score: 96,
    summary: "服装一致",
    issues: [],
    checkedAt: "",
    ...patch,
  };
}

test("换装编辑任务固定产品图与模特图职责并使用八段结构化提示", () => {
  const rules = buildGarmentProtectionRules(garmentLock());
  const task = buildTryOnEditTask({ garmentRules: rules, modelAnalysis });
  const prompt = tryOnEditTaskPrompt(task, "黑色短款上衣");
  assert.match(prompt, /task/);
  assert.match(prompt, /sourceOfTruth/);
  assert.match(prompt, /mustPreservePerson/);
  assert.match(prompt, /mustReplaceGarment/);
  assert.match(prompt, /garmentProtectedDetails/);
  assert.match(prompt, /forbiddenChanges/);
  assert.match(prompt, /qualityRequirements/);
  assert.match(prompt, /reviewWarnings/);
  assert.match(prompt, /产品图.*唯一真值/);
  assert.match(prompt, /参考模特原服装.*待删除/);
  assert.match(prompt, /扣子数量：3颗/);
  assert.match(prompt, /刺绣不可见，需要人工确认/);
});

test("只有人物画面正确且错误区域可靠时才允许局部修复", () => {
  const repairTargets = [
    {
      type: "buttons" as const,
      description: "扣子数量应为3颗",
      boundingBox: { x: 0.42, y: 0.3, width: 0.12, height: 0.25 },
      confidence: 0.94,
    },
  ];
  const local = resolveTryOnConsistencyReport({
    subject: subject(),
    garment: garment({
      status: "needs_redo",
      issues: ["扣子数量错误"],
      repairTargets,
    }),
    repairTargets,
  });
  assert.equal(local.status, "needs_redo");
  assert.equal(local.localRepairEligible, true);

  const wholeImageBroken = resolveTryOnConsistencyReport({
    subject: subject({ status: "failed", poseMatch: false }),
    garment: garment({ status: "needs_redo" }),
    repairTargets,
  });
  assert.equal(wholeImageBroken.status, "needs_redo");
  assert.equal(wholeImageBroken.localRepairEligible, false);
});

test("服装保护规则不锁定看不清的细节并强制进入人工确认", () => {
  const rules = buildGarmentProtectionRules(garmentLock());
  assert.ok(rules.protectedDetails.includes("扣子数量：3颗"));
  assert.equal(
    rules.protectedDetails.some((item) => item.startsWith("刺绣：")),
    false,
  );
  assert.ok(rules.needsReview.some((item) => item.startsWith("刺绣：")));
  assert.ok(rules.forbiddenChanges.some((item) => item.includes("不可见区域")));
});
