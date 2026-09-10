import crypto from "node:crypto";
import type {
  GarmentDetailLock,
  GarmentDetailLockFieldKey,
  GarmentDetailLockValue,
  GarmentDetailReference,
  Project,
} from "./db";

export const GARMENT_DETAIL_FIELD_KEYS = [
  "category",
  "subcategory",
  "fit",
  "silhouette",
  "length",
  "neckline",
  "sleeve",
  "placket",
  "buttonCount",
  "buttonPosition",
  "buttonShape",
  "pocketCount",
  "pocketPosition",
  "pocketShape",
  "stripeCount",
  "stripePosition",
  "stripes",
  "trim",
  "stitching",
  "print",
  "embroidery",
  "paneling",
  "fabricTexture",
  "fabricGloss",
  "drape",
  "drawstring",
  "waistband",
  "trouserShape",
  "slit",
  "hem",
  "symmetry",
  "otherDetails",
] as const satisfies readonly GarmentDetailLockFieldKey[];

export const GARMENT_DETAIL_FIELD_LABELS: Record<
  GarmentDetailLockFieldKey,
  string
> = {
  category: "商品类别",
  subcategory: "商品子类",
  fit: "版型",
  silhouette: "廓形",
  length: "衣长/裤长",
  neckline: "领口",
  sleeve: "袖型/袖口",
  placket: "门襟",
  buttonCount: "扣子数量",
  buttonPosition: "扣子位置",
  buttonShape: "扣子形状",
  pocketCount: "口袋数量",
  pocketPosition: "口袋位置",
  pocketShape: "口袋形状",
  stripeCount: "条纹数量",
  stripePosition: "条纹位置",
  stripes: "条纹布局",
  trim: "包边",
  stitching: "车线",
  print: "印花",
  embroidery: "刺绣",
  paneling: "拼接",
  fabricTexture: "面料纹理与垂感",
  fabricGloss: "面料光泽",
  drape: "垂感",
  drawstring: "抽绳",
  waistband: "腰头",
  trouserShape: "裤型",
  slit: "开叉",
  hem: "下摆/裤脚",
  symmetry: "左右结构",
  otherDetails: "其他关键设计细节",
};

const REFERENCE_DEFINITIONS = [
  ["productFrontImage", "front", "产品正面图", 100],
  ["productBackImage", "back", "产品背面图", 96],
  ["buttonCloseupImage", "buttons", "纽扣特写", 94],
  ["pocketCloseupImage", "pockets", "口袋特写", 93],
  ["necklineCloseupImage", "neckline", "领口特写", 92],
  ["sleeveCloseupImage", "sleeve", "袖口特写", 91],
  ["hemCloseupImage", "hem", "下摆/裤脚特写", 90],
  ["printCloseupImage", "print", "印花/刺绣特写", 89],
  ["fabricTextureImage", "fabric", "面料特写", 88],
  ["stitchingCloseupImage", "stitching", "车线特写", 87],
  ["productDetailImage", "structure_detail", "综合结构细节图", 86],
] as const;

export function collectGarmentDetailReferences(
  project: Project,
  primaryImage: string,
): GarmentDetailReference[] {
  const seen = new Set([primaryImage]);
  const references: GarmentDetailReference[] = [];
  for (const [assetKey, role, label, priority] of REFERENCE_DEFINITIONS) {
    const image = project.assets[assetKey];
    if (!image || seen.has(image)) continue;
    const evidence = project.assetEvidence?.[assetKey];
    // AI 只负责给出第一版裁图。用户没有确认前，它不能成为换装的硬约束证据。
    if (evidence?.source === "ai_crop" && !evidence.confirmed) continue;
    seen.add(image);
    const humanPriority =
      evidence?.source === "manual_crop"
        ? 200
        : evidence?.source === "manual"
          ? 180
          : evidence?.source === "ai_crop" && evidence.confirmed
            ? 120
            : 0;
    const sourceLabel =
      evidence?.source === "manual_crop"
        ? "用户从主图框选确认"
        : evidence?.source === "manual"
          ? "用户上传确认"
          : evidence?.source === "ai_crop" && evidence.confirmed
            ? "AI裁图并经用户确认"
            : "历史已保存素材";
    references.push({
      role,
      label: `${label}（${sourceLabel}）`,
      image,
      priority: priority + humanPriority,
    });
  }
  // Seedream 多图输入总数最多按 10 张控制：模特 + 主服装 + 最多 8 张细节证据。
  return references.sort((a, b) => b.priority - a.priority).slice(0, 8);
}

export function garmentDetailSourceSignature(
  project: Project,
  primaryImage: string,
) {
  const references = collectGarmentDetailReferences(project, primaryImage);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ primaryImage, references }))
    .digest("hex");
}

export function buildGarmentDetailProtectedDetails(lock: GarmentDetailLock) {
  const lines = GARMENT_DETAIL_FIELD_KEYS.flatMap((key) => {
    const field = lock.fields[key];
    if (!field || field.visibility !== "visible" || !field.value.trim())
      return [];
    return [`${GARMENT_DETAIL_FIELD_LABELS[key]}：${field.value}`];
  });
  return [
    "【服装细节锁定层 · 最高服装约束】以下逐项事实来自产品主图和对应特写；自然穿着形变可以发生，但数量、相对位置、形状、比例、材质关系不得改变。",
    ...lines,
    ...lock.protectedDetails.map((item) => `必须保护：${item}`),
    "禁止新增产品证据中不存在的扣子、口袋、条纹、包边、车线、印花、刺绣、拼接或其他装饰；不可见项不得猜测。",
  ].join("\n");
}

const emptyValue = (): GarmentDetailLockValue => ({
  value: "无法从图片确认",
  confidence: 0,
  visibility: "not_visible",
  sourceRoles: [],
});

export function buildManualGarmentDetailLock(
  project: Project,
  primaryImage: string,
): GarmentDetailLock | undefined {
  const profile = project.profile;
  if (profile?.reviewStatus !== "confirmed") return;
  const attributes = profile.attributes || {};
  const mapped: Partial<Record<GarmentDetailLockFieldKey, string | undefined>> =
    {
      category: project.productType,
      fit: attributes.fit,
      length: attributes.garmentLength,
      neckline: attributes.neckline,
      sleeve: attributes.sleeveType,
      placket: attributes.placketType,
      buttonCount: attributes.buttonCount,
      pocketPosition: attributes.pocketDetails,
      trim: attributes.trimColor,
      print: [attributes.printType, attributes.printPosition]
        .filter(Boolean)
        .join("；"),
      paneling: attributes.colorBlockLayout,
      fabricTexture: [
        attributes.fabric,
        attributes.fabricTexture,
        attributes.weaveStructure,
      ]
        .filter(Boolean)
        .join("；"),
      drawstring: attributes.drawstring,
      waistband: attributes.belt,
      slit: attributes.slit,
      hem: attributes.specialDesign,
      symmetry: attributes.asymmetry,
    };
  const visibleCount = Object.values(mapped).filter(
    (value) => value && !value.includes("无法从图片确认"),
  ).length;
  if (visibleCount < 6) return;
  const fields = Object.fromEntries(
    GARMENT_DETAIL_FIELD_KEYS.map((key) => {
      const value = mapped[key];
      return [
        key,
        value && !value.includes("无法从图片确认")
          ? {
              value,
              confidence: 1,
              visibility: "visible" as const,
              sourceRoles: ["manual_confirmed_profile"],
            }
          : emptyValue(),
      ];
    }),
  ) as Record<GarmentDetailLockFieldKey, GarmentDetailLockValue>;
  const issues = GARMENT_DETAIL_FIELD_KEYS.filter(
    (key) => fields[key].visibility === "not_visible",
  ).map((key) => `${GARMENT_DETAIL_FIELD_LABELS[key]}未由人工确认资料覆盖`);
  const detailReferences = collectGarmentDetailReferences(
    project,
    primaryImage,
  );
  const lock: GarmentDetailLock = {
    version: "garment-detail-lock-v2",
    status: issues.length ? "needs_review" : "locked",
    sourceImage: primaryImage,
    sourceSignature: garmentDetailSourceSignature(project, primaryImage),
    productType: project.productType,
    fields,
    protectedDetails: [
      ...new Set(
        [
          ...(profile.protectionItems || []),
          profile.detailDescription || "",
        ].filter(Boolean),
      ),
    ],
    detailReferences,
    issues,
    lockedAt: new Date().toISOString(),
  };
  return lock;
}

export type TryonDetailChecks = {
  singleSourceGarment: boolean;
  silhouette: boolean;
  material: boolean;
  texture: boolean;
  construction: boolean;
  details: boolean;
  color: boolean;
  buttons: boolean;
  pockets: boolean;
  stripesTrimStitching: boolean;
  graphics: boolean;
  necklineSleeveHem: boolean;
  symmetry: boolean;
  extraDesigns: boolean;
  missingDesigns: boolean;
};

export function resolveTryonDetailStatus(input: {
  consistent: boolean;
  score: number;
  checks: TryonDetailChecks;
}) {
  const critical = [
    input.checks.singleSourceGarment,
    input.checks.silhouette,
    input.checks.material,
    input.checks.construction,
    input.checks.buttons,
    input.checks.pockets,
    input.checks.stripesTrimStitching,
    input.checks.graphics,
    input.checks.necklineSleeveHem,
    input.checks.symmetry,
    input.checks.extraDesigns,
    input.checks.missingDesigns,
  ];
  if (
    !input.consistent ||
    input.score < 78 ||
    critical.some((passed) => !passed)
  )
    return "needs_redo" as const;
  if (
    input.score < 90 ||
    !input.checks.texture ||
    !input.checks.details ||
    !input.checks.color
  )
    return "needs_review" as const;
  return "passed" as const;
}

export function buildTryonDetailRepairPrompt(lock: GarmentDetailLock) {
  return (
    `任务：只修复当前换装候选中的服装细节，不重新设计整张图片。\n` +
    `第1张是待修复候选图，锁定人物、脸、皮肤、发型、身体、姿势、手脚、牛仔裤/下装、配饰、背景、光线、景别和构图，全部不得改变。\n` +
    `第2张是服装产品主依据；后续图片是按名称标注的细节证据。产品图和特写拥有全部服装设计事实。\n` +
    `${buildGarmentDetailProtectedDetails(lock)}\n` +
    `服装只能对应第2张产品依据中的同一件、同一颜色款；若产品依据包含多件或多色，禁止从第二件服装借用颜色、图案、面料或细节。` +
    `只纠正错误的服装局部：扣子、口袋、条纹、包边、车线、印花、刺绣、拼接、领口、袖口、下摆、面料纹理。未出错区域保持候选图像素和质感。输出一张完整高清实拍图，不输出对比图、文字或水印。`
  );
}
