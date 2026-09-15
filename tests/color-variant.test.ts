import test from "node:test";
import assert from "node:assert/strict";
import {
  buildColorMap,
  colorVariantAnalysisSignature,
  isCurrentColorVariantAnalysis,
  reconcileVariantPrimaryColor,
  referenceNeedsReview,
} from "../src/lib/color-variant-map";
import type { ColorVariantColorProfile } from "../src/lib/db";
import { resolveRecolorReferenceEvidence } from "../src/lib/recolor-reference-source";

test("buildColorMap 从识别结果生成部位颜色映射", () => {
  const profile: ColorVariantColorProfile = {
    primaryColor: "绿色",
    primaryHex: "#2F5B43",
    trimColors: [{ part: "包边", colorName: "黑色", hex: "#000000" }],
    secondaryColors: [{ part: "侧条纹", colorName: "白色", hex: "#FFFFFF" }],
    buttonColors: [{ part: "扣子", colorName: "黑色", hex: "#000000" }],
  };
  const map = buildColorMap(profile);
  assert.equal(map.mainBody, "#2F5B43");
  assert.equal(map["包边"], "#000000");
  assert.equal(map["侧条纹"], "#FFFFFF");
  assert.equal(map.buttons, "#000000");
});

test("buildColorMap 无主色 HEX 时回退到颜色名称", () => {
  const map = buildColorMap({ primaryColor: "米白" });
  assert.equal(map.mainBody, "米白");
});

test("buildColorMap 用用户选定基本色锁定主体并保留照片局部配色", () => {
  const map = buildColorMap(
    {
      primaryColor: "深炭灰色",
      primaryHex: "#3A3A3A",
      secondaryColors: [
        { part: "下摆条纹", colorName: "酒红色", hex: "#7A2E3A" },
      ],
      trimColors: [{ part: "领口罗纹", colorName: "深炭灰色", hex: "#3B3B3B" }],
    },
    { name: "纯黑色", hex: "#1A1A1A" },
  );
  assert.equal(map.mainBody, "#1A1A1A");
  assert.equal(map["领口罗纹"], "#1A1A1A");
  assert.equal(map["下摆条纹"], "#7A2E3A");
});

test("色款分析签名包含用户基本色，改色后不会命中旧缓存", () => {
  const images = [{ id: "primary", hash: "same-image" }];
  assert.notEqual(
    colorVariantAnalysisSignature(images, {
      name: "纯黑色",
      hex: "#1A1A1A",
    }),
    colorVariantAnalysisSignature(images, {
      name: "米白色",
      hex: "#F5F3EE",
    }),
  );
});

test("buildColorMap 同一部位多道颜色按顺序编号保留", () => {
  const profile: ColorVariantColorProfile = {
    primaryColor: "米白",
    primaryHex: "#F5F3ED",
    secondaryColors: [
      { part: "下摆条纹", colorName: "深蓝色", hex: "#1C2F47" },
      { part: "下摆条纹", colorName: "酒红色", hex: "#6B2C3A" },
      { part: "袖口条纹", colorName: "深蓝色", hex: "#1C2F47" },
    ],
  };
  const map = buildColorMap(profile);
  assert.equal(map["下摆条纹"], "#1C2F47");
  assert.equal(map["下摆条纹2"], "#6B2C3A");
  assert.equal(map["袖口条纹"], "#1C2F47");
});

test("referenceNeedsReview 在存在冲突时返回 true", () => {
  assert.equal(
    referenceNeedsReview({ conflicts: ["主色一张偏绿一张偏蓝"] }),
    true,
  );
});

test("referenceNeedsReview 在置信度过低时返回 true", () => {
  assert.equal(referenceNeedsReview({ confidence: 0.4 }), true);
});

test("referenceNeedsReview 无冲突且高置信度时返回 false", () => {
  assert.equal(referenceNeedsReview({ confidence: 0.9, conflicts: [] }), false);
  assert.equal(referenceNeedsReview(undefined), false);
});

test("单独上传的颜色款参考图完全覆盖共享颜色参考", () => {
  const referenceImages = [
    {
      id: "support",
      path: "/api/files/green-detail.jpg",
      hash: "support",
      role: "supporting" as const,
      isPrimary: false,
      uploadedAt: "2026-09-15T00:00:00.000Z",
    },
    {
      id: "primary",
      path: "/api/files/green-primary.jpg",
      hash: "primary",
      role: "primary" as const,
      isPrimary: true,
      uploadedAt: "2026-09-15T00:00:00.000Z",
    },
  ];
  const evidence = resolveRecolorReferenceEvidence(
    {
      id: "green",
      name: "旧共享绿色",
      hex: "#123456",
      cropImage: "/api/files/shared-green.jpg",
      status: "ready",
      referenceImages,
      referenceAnalysisSignature:
        colorVariantAnalysisSignature(referenceImages),
      colorProfile: {
        primaryColor: "墨绿色",
        primaryHex: "#234B36",
        confidence: 0.92,
      },
      colorMap: { mainBody: "#234B36", 包边: "#F5F0E6" },
    },
    "/api/files/global-crop.jpg",
  );
  assert.equal(evidence.mode, "independent");
  assert.deepEqual(evidence.images, [
    "/api/files/green-primary.jpg",
    "/api/files/green-detail.jpg",
  ]);
  assert.equal(evidence.images.includes("/api/files/global-crop.jpg"), false);
  assert.equal(evidence.images.includes("/api/files/shared-green.jpg"), false);
  assert.equal(evidence.promptColorName, "墨绿色");
  assert.equal(evidence.promptHex, "#234B36");
});

test("没有单独参考图时沿用共享色款裁图并锁定同款结构", () => {
  const evidence = resolveRecolorReferenceEvidence(
    {
      id: "beige",
      name: "米色",
      hex: "#E8DCC8",
      cropImage: "/api/files/beige-crop.jpg",
      status: "ready",
      designDetails: ["共享图疑似有不同口袋"],
      structureMode: "same_style",
    },
    "/api/files/global-crop.jpg",
  );
  assert.equal(evidence.mode, "shared");
  assert.deepEqual(evidence.images, ["/api/files/beige-crop.jpg"]);
  assert.equal(evidence.structureMode, "same_style");
  assert.deepEqual(evidence.structureDifferences, []);
  assert.deepEqual(evidence.colorMap, {});
});

test("AI 观察到的疑似设计差异不能自动解除同款结构锁", () => {
  const referenceImages = [
    {
      id: "primary",
      path: "/api/files/black.jpg",
      hash: "black",
      role: "primary" as const,
      isPrimary: true,
      uploadedAt: "2026-09-15T00:00:00.000Z",
    },
  ];
  const evidence = resolveRecolorReferenceEvidence({
    id: "black",
    name: "黑色",
    status: "ready",
    referenceImages,
    referenceAnalysisSignature: colorVariantAnalysisSignature(referenceImages),
    colorProfile: {
      primaryColor: "纯黑色",
      designDifferences: ["下摆为红白双条纹"],
      confidence: 0.9,
      conflicts: [],
    },
    designOverrides: ["下摆为红白双条纹"],
    referenceNeedsReview: false,
  });
  assert.equal(evidence.structureMode, "same_style");
  assert.deepEqual(evidence.structureDifferences, []);
  assert.equal(evidence.structureDifferenceConfidence, 0);
});

test("旧版错误颜色分析不得进入新的复色生成", () => {
  assert.equal(isCurrentColorVariantAnalysis("primary:old-hash"), false);
  const evidence = resolveRecolorReferenceEvidence({
    id: "black",
    name: "纯黑色",
    hex: "#1A1A1A",
    status: "ready",
    referenceImages: [
      {
        id: "primary",
        path: "/api/files/black.jpg",
        hash: "black",
        role: "primary",
        isPrimary: true,
        uploadedAt: "2026-09-15T00:00:00.000Z",
      },
    ],
    referenceAnalysisSignature: "primary:old-hash",
    colorProfile: {
      primaryColor: "米白色",
      primaryHex: "#F5F3EE",
      confidence: 0.95,
    },
    colorMap: { mainBody: "#F5F3EE" },
    designOverrides: ["米白色主体"],
  });
  assert.equal(evidence.promptColorName, "纯黑色");
  assert.equal(evidence.promptHex, "#1A1A1A");
  assert.deepEqual(evidence.colorMap, {});
  assert.deepEqual(evidence.designDetails, []);
});

test("独立参考照片存在色差时人工基本色仍控制主体", () => {
  const referenceImages = [
    {
      id: "primary",
      path: "/api/files/black.jpg",
      hash: "black",
      role: "primary" as const,
      isPrimary: true,
      uploadedAt: "2026-09-15T00:00:00.000Z",
    },
  ];
  const evidence = resolveRecolorReferenceEvidence({
    id: "black",
    name: "纯黑色",
    userConfirmedName: "纯黑色",
    baseHex: "#1A1A1A",
    hex: "#1A1A1A",
    status: "ready",
    referenceImages,
    referenceAnalysisSignature: colorVariantAnalysisSignature(referenceImages),
    colorProfile: {
      primaryColor: "深炭灰色",
      primaryHex: "#3A3A3A",
      secondaryColors: [
        { part: "下摆条纹", colorName: "酒红色", hex: "#7A2E3A" },
      ],
      confidence: 0.94,
    },
    colorMap: {
      mainBody: "#3A3A3A",
      下摆条纹: "#7A2E3A",
    },
  });
  assert.equal(evidence.mainColorAuthority, "selected");
  assert.equal(evidence.promptColorName, "纯黑色");
  assert.equal(evidence.promptHex, "#1A1A1A");
  assert.equal(evidence.colorMap.mainBody, "#1A1A1A");
  assert.equal(evidence.colorMap["下摆条纹"], "#7A2E3A");
});

test("远程识别误读为底图白色时由当前参考图本地主色纠正", () => {
  const corrected = reconcileVariantPrimaryColor(
    { primaryColor: "米白色", primaryHex: "#F5F3EE", confidence: 0.95 },
    { hex: "#424345", pixelRatio: 0.53, confidence: 1 },
    { hex: "#F0EEE8", pixelRatio: 0.5, confidence: 1 },
  );
  assert.equal(corrected.primaryHex, "#424345");
  assert.notEqual(corrected.primaryColor, "米白色");
});
