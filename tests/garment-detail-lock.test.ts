import assert from "node:assert/strict";
import test from "node:test";
import type {
  GarmentDetailLock,
  GarmentDetailLockFieldKey,
  Project,
} from "../src/lib/db";
import {
  GARMENT_DETAIL_FIELD_KEYS,
  buildGarmentDetailProtectedDetails,
  collectGarmentDetailReferences,
  resolveTryonDetailStatus,
} from "../src/lib/garment-detail-lock";
import {
  MAX_SAFE_GENERATION_SEED,
  randomGenerationSeed,
} from "../src/lib/generation-seed";

function project(assets: Project["assets"]): Project {
  return {
    id: "p",
    sku: "SKU",
    productName: "上衣",
    productType: "上衣",
    currentStep: 2,
    status: "进行中",
    createdAt: "",
    updatedAt: "",
    assets,
    settings: {},
    targetColors: [],
  };
}

function lockField(value = "无") {
  return {
    value,
    confidence: 0.95,
    visibility: "visible" as const,
    sourceRoles: ["garment_primary"],
  };
}

test("细节参考按角色去重并限制为最多八张", () => {
  const p = project({
    garmentImage: "/api/files/main.jpg",
    productFrontImage: "/api/files/front.jpg",
    productBackImage: "/api/files/back.jpg",
    productDetailImage: "/api/files/detail.jpg",
    printCloseupImage: "/api/files/print.jpg",
    buttonCloseupImage: "/api/files/button.jpg",
    pocketCloseupImage: "/api/files/pocket.jpg",
    necklineCloseupImage: "/api/files/neck.jpg",
    sleeveCloseupImage: "/api/files/sleeve.jpg",
    hemCloseupImage: "/api/files/hem.jpg",
    stitchingCloseupImage: "/api/files/stitch.jpg",
    fabricTextureImage: "/api/files/fabric.jpg",
  });
  const refs = collectGarmentDetailReferences(p, "/api/files/main.jpg");
  assert.equal(refs.length, 8);
  assert.equal(refs[0].role, "front");
  assert.ok(refs.some((ref) => ref.role === "buttons"));
  assert.equal(new Set(refs.map((ref) => ref.image)).size, refs.length);
});

test("未人工确认的AI裁图不进入换装，人工框选细节优先", () => {
  const p = project({
    garmentImage: "/api/files/main.jpg",
    productFrontImage: "/api/files/front-ai.jpg",
    buttonCloseupImage: "/api/files/button-confirmed.jpg",
    pocketCloseupImage: "/api/files/pocket-manual.jpg",
  });
  p.assetEvidence = {
    productFrontImage: {
      source: "ai_crop",
      confirmed: false,
      needsReview: true,
      createdAt: "",
    },
    buttonCloseupImage: {
      source: "ai_crop",
      confirmed: true,
      needsReview: false,
      createdAt: "",
      reviewedAt: "",
    },
    pocketCloseupImage: {
      source: "manual_crop",
      confirmed: true,
      needsReview: false,
      createdAt: "",
      reviewedAt: "",
    },
  };
  const refs = collectGarmentDetailReferences(p, "/api/files/main.jpg");
  assert.equal(
    refs.some((ref) => ref.image === "/api/files/front-ai.jpg"),
    false,
  );
  assert.equal(refs[0].image, "/api/files/pocket-manual.jpg");
  assert.match(refs[0].label, /用户从主图框选确认/);
  assert.match(refs[1].label, /AI裁图并经用户确认/);
});

test("结构化细节逐项进入 protectedDetails", () => {
  const fields = Object.fromEntries(
    GARMENT_DETAIL_FIELD_KEYS.map((key) => [key, lockField()]),
  ) as Record<GarmentDetailLockFieldKey, ReturnType<typeof lockField>>;
  fields.buttonCount = lockField("4颗");
  fields.buttonPosition = lockField("前中单排等距");
  fields.pocketCount = lockField("2个");
  fields.fabricTexture = lockField("细斜纹、轻微光泽、挺括垂感");
  const lock: GarmentDetailLock = {
    version: "garment-detail-lock-v2",
    status: "locked",
    sourceImage: "/api/files/main.jpg",
    sourceSignature: "x",
    productType: "上衣",
    fields,
    protectedDetails: ["不得新增装饰"],
    detailReferences: [],
    issues: [],
    lockedAt: "",
  };
  const prompt = buildGarmentDetailProtectedDetails(lock);
  assert.match(prompt, /扣子数量：4颗/);
  assert.match(prompt, /扣子位置：前中单排等距/);
  assert.match(prompt, /口袋数量：2个/);
  assert.match(prompt, /面料纹理与垂感：细斜纹/);
  assert.match(prompt, /禁止新增/);
});

test("任一关键服装细节不一致会进入 needs_redo", () => {
  const allPassed = {
    singleSourceGarment: true,
    silhouette: true,
    material: true,
    texture: true,
    construction: true,
    details: true,
    color: true,
    buttons: true,
    pockets: true,
    stripesTrimStitching: true,
    graphics: true,
    necklineSleeveHem: true,
    symmetry: true,
    extraDesigns: true,
    missingDesigns: true,
  };
  assert.equal(
    resolveTryonDetailStatus({
      consistent: true,
      score: 96,
      checks: allPassed,
    }),
    "passed",
  );
  assert.equal(
    resolveTryonDetailStatus({
      consistent: true,
      score: 96,
      checks: { ...allPassed, buttons: false },
    }),
    "needs_redo",
  );
  assert.equal(
    resolveTryonDetailStatus({
      consistent: true,
      score: 96,
      checks: { ...allPassed, singleSourceGarment: false },
    }),
    "needs_redo",
  );
  assert.equal(
    resolveTryonDetailStatus({
      consistent: true,
      score: 85,
      checks: allPassed,
    }),
    "needs_review",
  );
  assert.equal(
    resolveTryonDetailStatus({
      consistent: true,
      score: 96,
      checks: { ...allPassed, texture: false },
    }),
    "needs_redo",
  );
  assert.equal(
    resolveTryonDetailStatus({
      consistent: true,
      score: 96,
      checks: { ...allPassed, details: false },
    }),
    "needs_redo",
  );
  assert.equal(
    resolveTryonDetailStatus({
      consistent: true,
      score: 96,
      checks: { ...allPassed, color: false },
    }),
    "needs_redo",
  );
  assert.equal(
    resolveTryonDetailStatus({
      consistent: true,
      score: 94,
      checks: allPassed,
    }),
    "needs_review",
  );
});

test("生成随机种子始终位于方舟兼容的正整数范围", () => {
  for (let index = 0; index < 200; index++) {
    const seed = randomGenerationSeed();
    assert.ok(Number.isInteger(seed));
    assert.ok(seed >= 1 && seed <= MAX_SAFE_GENERATION_SEED);
  }
});
