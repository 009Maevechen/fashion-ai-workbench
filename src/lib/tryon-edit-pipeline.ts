import type {
  GarmentConsistencyCheck,
  GarmentDetailLock,
  NormalizedCropRegion,
  TryonSubjectFidelityCheck,
} from "./db";
import { GARMENT_DETAIL_FIELD_LABELS } from "./garment-detail-lock";

export type ModelReferenceAnalysis = {
  version: "tryon-model-analysis-v1";
  sourceImage: string;
  personIdentity: string;
  pose: string;
  bodyProportions: string;
  shotType: string;
  composition: string;
  cameraAngle: string;
  background: string;
  lighting: string;
  skinTone: string;
  hairstyle: string;
  faceVisibility: "visible" | "hidden" | "partial";
  protectedSceneDetails: string[];
  needsReview: string[];
  analyzedAt: string;
  model?: string;
};

export type GarmentProtectionRules = {
  protectedDetails: string[];
  forbiddenChanges: string[];
  riskWarnings: string[];
  needsReview: string[];
};

export type TryOnEditTask = {
  version: "tryon-edit-task-v1";
  task: string;
  sourceOfTruth: {
    garment: string;
    personAndScene: string;
    replaceTarget: string;
  };
  mustPreservePerson: string[];
  mustReplaceGarment: string[];
  garmentProtectedDetails: string[];
  forbiddenChanges: string[];
  qualityRequirements: string[];
  reviewWarnings: string[];
};

export type TryOnRepairTarget = {
  type:
    | "buttons"
    | "pockets"
    | "stripes"
    | "trim"
    | "stitching"
    | "print"
    | "embroidery"
    | "paneling"
    | "neckline"
    | "sleeve"
    | "hem"
    | "fabric"
    | "other";
  description: string;
  boundingBox?: NormalizedCropRegion;
  confidence: number;
};

export type TryOnConsistencyReport = {
  status: "pass" | "needs_review" | "needs_redo";
  summary: string;
  issues: string[];
  repairTargets: TryOnRepairTarget[];
  localRepairEligible: boolean;
};

const unique = (values: Array<string | undefined>, limit = 60) =>
  [
    ...new Set(
      values.map((value) => value?.trim()).filter(Boolean) as string[],
    ),
  ].slice(0, limit);

export function buildGarmentProtectionRules(
  lock: GarmentDetailLock,
): GarmentProtectionRules {
  const visibleFacts = Object.entries(lock.fields).flatMap(([key, field]) =>
    field?.visibility === "visible" && field.value.trim()
      ? [
          `${GARMENT_DETAIL_FIELD_LABELS[key as keyof typeof GARMENT_DETAIL_FIELD_LABELS]}：${field.value}`,
        ]
      : [],
  );
  const uncertainFacts = Object.entries(lock.fields).flatMap(([key, field]) =>
    field?.visibility === "not_visible" ||
    (field?.visibility === "visible" && field.confidence < 0.7)
      ? [
          `${GARMENT_DETAIL_FIELD_LABELS[key as keyof typeof GARMENT_DETAIL_FIELD_LABELS]}：${field.value || "无法从图片确认"}`,
        ]
      : [],
  );
  return {
    protectedDetails: unique([...visibleFacts, ...lock.protectedDetails]),
    forbiddenChanges: unique([
      "禁止用相似款、近似款或模型自行理解的替代款冒充产品图服装",
      "禁止新增产品图中不存在的服装结构或装饰",
      "禁止删除产品图中真实可见的服装结构或装饰",
      "禁止沿用或混入参考模特原服装的颜色、版型、材质、纹理与细节",
      "禁止改变商品类别、版型、廓形、长度和覆盖范围",
      "禁止改变扣子、口袋、条纹、包边、拼接、印花、刺绣和车线的数量、位置或形状",
      "禁止改变任何可见细节的相对比例、方向、间距、颜色关系与材质关系",
      "禁止根据不可见区域猜测或补造服装细节",
    ]),
    riskWarnings: unique(lock.issues),
    needsReview: unique(uncertainFacts),
  };
}

export function buildTryOnEditTask(input: {
  garmentRules: GarmentProtectionRules;
  modelAnalysis: ModelReferenceAnalysis;
}): TryOnEditTask {
  const { garmentRules, modelAnalysis } = input;
  return {
    version: "tryon-edit-task-v1",
    task: "以参考模特图为基础图片，完整删除模特原服装，只把产品图中的选定服装穿到同一位模特身上。",
    sourceOfTruth: {
      garment:
        "产品图及经人工确认的服装细节图是服装设计、颜色、面料、版型和结构的唯一真值。",
      personAndScene:
        "参考模特图是人物身份、姿势、身体比例、景别、构图、角度、背景、光线和露脸状态的唯一真值。",
      replaceTarget:
        "参考模特原服装只是待删除、待替换区域，绝不是服装设计参考。",
    },
    mustPreservePerson: unique([
      `人物身份：${modelAnalysis.personIdentity}`,
      `姿势与动作：${modelAnalysis.pose}`,
      `身体比例：${modelAnalysis.bodyProportions}`,
      `景别：${modelAnalysis.shotType}`,
      `构图：${modelAnalysis.composition}`,
      `拍摄角度：${modelAnalysis.cameraAngle}`,
      `背景：${modelAnalysis.background}`,
      `光线：${modelAnalysis.lighting}`,
      `肤色与皮肤质感：${modelAnalysis.skinTone}`,
      `发型：${modelAnalysis.hairstyle}`,
      `露脸状态：${modelAnalysis.faceVisibility}`,
      ...modelAnalysis.protectedSceneDetails,
    ]),
    mustReplaceGarment: [
      "删除参考模特原服装的全部颜色、外轮廓、覆盖范围、结构、纹理和装饰",
      "在同一人物、同一姿势、同一画面上换入产品图服装",
      "只允许修改原服装区域以及新服装真实覆盖所必需的相邻像素",
    ],
    garmentProtectedDetails: garmentRules.protectedDetails,
    forbiddenChanges: garmentRules.forbiddenChanges,
    qualityRequirements: [
      "产品服装必须达到逐项视觉等价，不接受只是相似或大致接近的款式",
      "除人体贴合产生的必要透视、遮挡和自然褶皱外，所有可见服装事实必须与产品证据一致",
      "服装外轮廓、长度、松量、裁片比例、结构线和覆盖范围必须与产品图一致",
      "每个可见细节的数量、相对位置、方向、形状、尺寸比例、颜色和材质关系必须一致",
      "输出单张完整高清电商实拍图，不裁掉服装",
      "人物皮肤自然细腻，无脏感、涂抹感、塑料感和明显AI痕迹",
      "服装面料纹理、材质、光泽、垂感、车线和边缘清晰真实",
      "手脚、肢体、遮挡关系和服装边缘自然，无畸形、粘连、重复或杂质",
    ],
    reviewWarnings: unique([
      ...garmentRules.riskWarnings,
      ...garmentRules.needsReview.map((item) => `服装证据待确认：${item}`),
      ...modelAnalysis.needsReview.map((item) => `模特图证据待确认：${item}`),
    ]),
  };
}

function section(title: string, values: string[]) {
  return `${title}\n${values.map((value) => `- ${value}`).join("\n") || "- 无"}`;
}

export function tryOnEditTaskPrompt(
  task: TryOnEditTask,
  garmentDescription?: string,
) {
  return [
    "【服装换装结构化编辑任务】",
    `task\n- ${task.task}`,
    section("sourceOfTruth", [
      `garment: ${task.sourceOfTruth.garment}`,
      `personAndScene: ${task.sourceOfTruth.personAndScene}`,
      `replaceTarget: ${task.sourceOfTruth.replaceTarget}`,
    ]),
    section("mustPreservePerson", task.mustPreservePerson),
    section("mustReplaceGarment", task.mustReplaceGarment),
    section("garmentProtectedDetails", task.garmentProtectedDetails),
    section("forbiddenChanges", task.forbiddenChanges),
    section("qualityRequirements", task.qualityRequirements),
    section("reviewWarnings", task.reviewWarnings),
    garmentDescription ? `garmentDescription\n- ${garmentDescription}` : "",
    "执行方式：把第1张参考模特图作为需要编辑的基础图；第2张产品图及后续细节图只提供服装事实。不要自由重画整张画面。产品服装在新人体上的必要透视与自然褶皱可以变化，但商品设计事实不得变化；不得以相似款或近似细节代替。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function resolveTryOnConsistencyReport(input: {
  subject: TryonSubjectFidelityCheck;
  garment: GarmentConsistencyCheck;
  repairTargets?: TryOnRepairTarget[];
}): TryOnConsistencyReport {
  const issues = unique([...input.subject.issues, ...input.garment.issues], 24);
  const subjectBroken =
    input.subject.status === "failed" ||
    !input.subject.basedOnModel ||
    !input.subject.poseMatch ||
    !input.subject.shotMatch ||
    input.subject.originalGarmentLeak;
  const garmentBroken = ["needs_redo", "failed"].includes(input.garment.status);
  const status =
    subjectBroken || garmentBroken
      ? "needs_redo"
      : input.subject.status === "needs_review" ||
          input.garment.status === "needs_review"
        ? "needs_review"
        : "pass";
  const repairTargets = (input.repairTargets || []).filter(
    (target) => target.confidence >= 0.65,
  );
  const localRepairEligible =
    status === "needs_redo" &&
    !subjectBroken &&
    repairTargets.length > 0 &&
    repairTargets.every((target) => Boolean(target.boundingBox));
  return {
    status,
    summary:
      status === "pass"
        ? "人物与画面保持稳定，产品服装设计一致性通过"
        : status === "needs_review"
          ? "存在不可可靠判断的项目，需要人工确认"
          : subjectBroken
            ? "人物、姿势、构图或模特原服装替换不完整，不能用局部修复掩盖整体错误"
            : "服装局部细节不一致，可在定位可靠时执行局部修复",
    issues,
    repairTargets,
    localRepairEligible,
  };
}

export function buildLocalRepairPrompt(input: {
  task: TryOnEditTask;
  targets: TryOnRepairTarget[];
  attempt: number;
  hasMask: boolean;
}) {
  return [
    `【换装局部修复 · 第${input.attempt}轮】`,
    `只修复这些已定位错误：${input.targets.map((target) => `${target.type}=${target.description}`).join("；")}`,
    input.hasMask
      ? "已提供透明编辑蒙版：只允许修改蒙版透明区域及必要的1至3像素过渡边缘。"
      : "当前模型不支持显式蒙版；必须把第1张候选图作为编辑底图，只修改上述明确部位，禁止整张重绘。",
    "其他已正确内容全部保持：人物身份、脸、皮肤、发型、姿势、身体比例、景别、构图、背景、光线、未出错服装区域和画质不得变化。",
    "修复后的对应细节必须与产品证据在数量、相对位置、方向、形状、比例、颜色和材质关系上逐项一致；相似或接近仍视为未修复。",
    section("garmentProtectedDetails", input.task.garmentProtectedDetails),
    section("forbiddenChanges", input.task.forbiddenChanges),
    "输出一张与待修复候选同尺寸、同构图的完整高清图片，不输出对比图、文字或水印。",
  ].join("\n\n");
}

export async function runTryOnEdit<T>(input: {
  task: TryOnEditTask;
  execute: (prompt: string) => Promise<T>;
  garmentDescription?: string;
}) {
  return input.execute(
    tryOnEditTaskPrompt(input.task, input.garmentDescription),
  );
}

export async function runLocalRepair<T>(input: {
  task: TryOnEditTask;
  targets: TryOnRepairTarget[];
  attempt: number;
  hasMask: boolean;
  execute: (prompt: string) => Promise<T>;
}) {
  if (!input.targets.length)
    throw new Error("没有可定位的局部错误，禁止盲目重绘");
  return input.execute(buildLocalRepairPrompt(input));
}
