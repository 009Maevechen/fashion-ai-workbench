import { parseProductionSets, type PrecheckStatus, type ProductionSetPlan, type WorkflowStage } from "./sku-production-plan";
import { legacyProductType, type GarmentCategory, type GarmentClassificationField } from "./garment-classification";

export type GarmentPrimaryCategory = GarmentCategory;

export type ProductionTaskType =
  | "换装"
  | "复色"
  | "三姿势"
  | "白底图"
  | "高清优化"
  | "局部修改"
  | "产品展示图";

export type DesignLevel = "simple" | "complex" | "needs_review";
export type IndexedImageType =
  | "product"
  | "model"
  | "pose"
  | "color"
  | "supplemental"
  | "unknown";

export type GarmentProductionProfile = {
  /** 新视觉理解层字段；与旧 primaryCategory 保持同步。 */
  category?: GarmentPrimaryCategory | "";
  subcategory?: string;
  primaryCategory: GarmentPrimaryCategory | "";
  secondaryCategory: string;
  garmentType?: string;
  style?: string;
  material?: string;
  season?: string;
  gender?: string;
  displayFocus?: string;
  fit?: string;
  silhouette?: string;
  length?: string;
  neckline?: string;
  sleeve?: string;
  cuff?: string;
  hem?: string;
  fabric?: string;
  texture?: string;
  gloss?: string;
  thickness?: string;
  drape?: string;
  buttonCount?: string;
  buttonPosition?: string;
  pocketCount?: string;
  pocketPosition?: string;
  stripes?: string;
  print?: string;
  paneling?: string;
  trim?: string;
  specialDesign?: string;
  protectedDetails: string[];
  forbiddenChanges: string[];
  riskWarnings: string[];
  confidence: number;
  source: "spreadsheet" | "ai" | "manual";
  sourceImage?: string;
  classificationConfirmed?: boolean;
  manualFields?: GarmentClassificationField[];
  analyzedAt?: string;
  model?: string;
};

export type SpreadsheetSourceLink = {
  importId: string;
  fileName: string;
  sheetName: string;
  rowNumber: number;
  importedAt: string;
};

export type ProjectImageRefs = {
  product: string[];
  model: string[];
  pose: string[];
  color: string[];
  supplemental: string[];
};

export type ColorVariantBinding = {
  id: string;
  name: string;
  primaryImageId?: string;
  supportingImageIds: string[];
  colorMap?: Record<string, string>;
  confidence?: number;
  needsReview: boolean;
  manualConfirmed: boolean;
};

export type PoseRecommendation = {
  groupId: string;
  poseGroupId: string;
  score: number;
  reasons: string[];
};

export type SkuProductionTask = {
  taskId: string;
  taskTypes: ProductionTaskType[];
  designLevel: DesignLevel;
  requirements: string;
  notes: string;
  /** F 列生产备注解析出的套内序号（0=第一套）。 */
  productionSets?: number[];
  setCount?: number;
  stopBefore?: WorkflowStage;
  precheck?: PrecheckStatus;
  status: "draft" | "needs_review" | "ready" | "running" | "completed" | "failed";
  recommendedPoses: PoseRecommendation[];
  issues: string[];
  createdAt: string;
  updatedAt: string;
};

export type NormalizedSkuRow = {
  rowNumber: number;
  sku: string;
  productName: string;
  /** C 列人工服装分类；为空时等待产品图视觉识别，不能根据标题猜测。 */
  categoryText: string;
  categorySource: "manual" | "ai";
  productImagePaths: string[];
  modelImagePaths: string[];
  poseImagePaths: string[];
  colorImagePaths: string[];
  supplementalImagePaths: string[];
  requirements: string;
  colorInfo: string;
  notes: string;
  taskTypes: ProductionTaskType[];
  colors: string[];
  garmentProfile: GarmentProductionProfile;
  designLevel: DesignLevel;
  /** F 列生产备注解析出的套数/截止阶段。 */
  setPlan: ProductionSetPlan;
  issues: string[];
};

type TableRow = Record<string, string>;

const aliases = {
  sku: ["SKU", "sku", "货号", "商品货号", "产品货号", "款号", "产品编号"],
  name: ["商品名称", "产品名称", "品名", "标题", "name", "productName", "title"],
  category: ["分类", "服装分类", "类目", "一级分类", "category"],
  subCategory: ["二级分类", "子类", "二级类目", "subCategory"],
  product: ["商品图片路径", "产品服装图", "产品图", "商品图", "主图", "图片", "productImage", "productImages"],
  model: ["模特参考图", "模特图", "modelImage", "modelReference"],
  pose: ["姿势参考图", "姿势图", "poseImage", "poseImages"],
  colorImages: ["颜色参考图", "多颜色参考图", "色卡图", "colorImages", "colorReference"],
  supplemental: ["补充参考图", "细节图", "补充素材", "detailImages", "supplementalImages"],
  requirements: ["制作要求", "生产要求", "任务要求", "需求", "requirements", "instruction"],
  colors: ["颜色信息", "颜色", "色号", "颜色款", "color", "colors"],
  notes: ["生产备注", "备注信息", "备注", "说明", "notes", "note"],
} as const;

function field(row: TableRow, keys: readonly string[]) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [key.trim().toLocaleLowerCase(), String(value || "").trim()]));
  for (const key of keys) {
    const value = normalized.get(key.toLocaleLowerCase());
    if (value) return value;
  }
  return "";
}

export function splitCellList(value: string): string[] {
  return [...new Set(value.split(/(?:\r?\n|[;,，；|])/).map((item) => item.trim()).filter(Boolean))];
}

function isLikelyImageReference(value: string) {
  return /^(?:https?:\/\/|file:\/\/|[A-Za-z]:[\\/]|[\\/])/.test(value) || /\.(?:jpe?g|png|webp|gif|heic|avif|bmp)$/i.test(value);
}

export function parseColorNames(value: string): string[] {
  return splitCellList(value)
    .flatMap((item) => item.split(/[、/]+/))
    .map((item) => item.trim().replace(/^(颜色|色号)[:：]\s*/, ""))
    .filter(Boolean);
}

export function inferTaskTypes(requirements: string, row: TableRow = {}): ProductionTaskType[] {
  const text = `${requirements} ${Object.values(row).join(" ")}`.toLocaleLowerCase();
  const rules: Array<[ProductionTaskType, RegExp]> = [
    ["换装", /换装|试衣|上身|穿搭|模特换衣|try.?on/],
    ["复色", /复色|换色|改色|多色|颜色款|recolou?r/],
    ["三姿势", /三姿势|3姿势|三张姿势|多姿势|pose/],
    ["白底图", /白底|纯白背景|white background/],
    ["高清优化", /高清|清晰化|超分|放大|upscale|enhance/],
    ["局部修改", /局部|修图|修改|重绘|inpaint/],
    ["产品展示图", /展示图|商品展示|场景图|陈列图|display/],
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([type]) => type);
}

const secondaryRules: Array<[GarmentPrimaryCategory, string, RegExp]> = [
  ["外套", "西装外套", /西装外套|blazer jacket/i],
  ["外套", "羽绒服", /羽绒服|down jacket/i],
  ["连衣裙", "针织裙", /针织连衣裙|knit dress/i],
  ["连衣裙", "吊带裙", /吊带裙|slip dress/i],
  ["连衣裙", "直筒连衣裙", /连衣裙|dress/i],
  ["上衣", "T恤", /t恤|t-shirt|tee/i],
  ["上衣", "衬衫", /衬衫|shirt|blouse/i],
  ["上衣", "卫衣", /卫衣|hoodie|sweatshirt/i],
  ["上衣", "毛衣", /毛衣|sweater/i],
  ["上衣", "针织衫", /针织衫|knit(?:wear)?/i],
  ["上衣", "西装", /西装|blazer/i],
  ["上衣", "背心", /背心|马甲|vest|tank/i],
  ["裤子", "牛仔裤", /牛仔裤|jeans|denim pants/i],
  ["裤子", "瑜伽裤", /瑜伽裤|leggings|yoga pants/i],
  ["裤子", "阔腿裤", /阔腿裤|wide.?leg/i],
  ["裤子", "工装裤", /工装裤|cargo pants/i],
  ["裤子", "休闲裤", /休闲裤|casual pants|trousers/i],
  ["裤子", "短裤", /短裤|shorts/i],
  ["裙子", "半身裙", /半身裙|skirt/i],
  ["裙子", "长裙", /长裙|maxi/i],
  ["裙子", "短裙", /短裙|mini skirt/i],
  ["外套", "外套", /外套|大衣|夹克|风衣|coat|jacket/i],
  ["泳装", "泳装", /泳装|泳衣|比基尼|swim|bikini/i],
  ["运动服", "运动服", /运动服|运动套装|sportswear|activewear/i],
  ["套装", "套装", /套装|两件套|三件套|set|suit/i],
];

export function classifyGarment(text: string): Pick<GarmentProductionProfile, "primaryCategory" | "secondaryCategory" | "confidence"> {
  const match = secondaryRules.find(([, , pattern]) => pattern.test(text));
  if (match) return { primaryCategory: match[0], secondaryCategory: match[1], confidence: 0.78 };
  if (/裤|pants|trousers/i.test(text)) return { primaryCategory: "裤子", secondaryCategory: "其他裤装", confidence: 0.62 };
  if (/裙|skirt/i.test(text)) return { primaryCategory: "裙子", secondaryCategory: "半身裙", confidence: 0.62 };
  return { primaryCategory: "上衣", secondaryCategory: "其他上衣", confidence: 0.35 };
}

const complexPattern = /撞色|条纹|印花|刺绣|拼接|包边|扣子|纽扣|特殊剪裁|不对称|多色|色块|提花|褶皱|蕾丝|镂空/i;

export function inferDesignLevel(text: string, hasColorReference = false): DesignLevel {
  if (complexPattern.test(text)) return "complex";
  if (hasColorReference || /纯色|无印花|基础款|简约/i.test(text)) return "simple";
  return "needs_review";
}

export function operationalProductType(profile: Pick<GarmentProductionProfile, "primaryCategory" | "secondaryCategory">) {
  return legacyProductType(profile.primaryCategory, profile.secondaryCategory);
}

export function normalizeSkuRow(row: TableRow, rowNumber: number): NormalizedSkuRow {
  const sku = field(row, aliases.sku);
  const productName = field(row, aliases.name) || sku;
  const productCell = field(row, aliases.product);
  const requirements = [field(row, aliases.requirements), ...splitCellList(productCell).filter((value) => !isLikelyImageReference(value))].filter(Boolean).join("；");
  const colorInfo = field(row, aliases.colors);
  const notes = [field(row, aliases.notes), ...splitCellList(productCell).filter((value) => !isLikelyImageReference(value))].filter(Boolean).join("；");
  const categoryText = field(row, aliases.category);
  const subCategoryText = field(row, aliases.subCategory);
  const productImagePaths = splitCellList(productCell).filter(isLikelyImageReference);
  const modelImagePaths = splitCellList(field(row, aliases.model));
  const poseImagePaths = splitCellList(field(row, aliases.pose));
  const colorImagePaths = splitCellList(field(row, aliases.colorImages));
  const supplementalImagePaths = splitCellList(field(row, aliases.supplemental));
  const colors = parseColorNames(colorInfo);
  const taskTypes = inferTaskTypes(requirements, row);
  // 表格人工分类可先沿用；无分类时不能从商品标题推断服装类型。
  const manualCategory = [categoryText, subCategoryText].filter(Boolean).join(" ");
  const categorySource: "manual" | "ai" = manualCategory ? "manual" : "ai";
  const classification = manualCategory
    ? classifyGarment(manualCategory)
    : { primaryCategory: "" as const, secondaryCategory: "", confidence: 0 };
  const setPlan = parseProductionSets(notes);
  const designLevel = inferDesignLevel(`${productName} ${requirements} ${notes}`, colorImagePaths.length > 0);
  const issues: string[] = [];
  if (!sku) issues.push("缺少 SKU / 货号");
  if (!productImagePaths.length) issues.push("缺少商品图片路径");
  if (!manualCategory) issues.push("服装分类等待产品图视觉识别，禁止按标题猜测");
  if (!taskTypes.length) issues.push("制作要求未能识别任务类型，需要人工确认");
  if (designLevel === "needs_review") issues.push("款式复杂度需要人工确认");
  if (setPlan.needsReview) issues.push(setPlan.reason || "生产备注无法确定做几套，需要人工确认");
  const garmentProfile: GarmentProductionProfile = {
    ...classification,
    category: classification.primaryCategory,
    subcategory: classification.secondaryCategory,
    protectedDetails: [],
    forbiddenChanges: ["禁止改变商品类别、版型、长度与真实设计", "禁止新增产品图中不存在的结构和装饰"],
    riskWarnings: issues.filter((issue) => issue.includes("款式")),
    source: categorySource === "manual" ? "spreadsheet" : "ai",
  };
  return {
    rowNumber,
    sku,
    productName,
    categoryText: manualCategory,
    categorySource,
    productImagePaths,
    modelImagePaths,
    poseImagePaths,
    colorImagePaths,
    supplementalImagePaths,
    requirements,
    colorInfo,
    notes,
    taskTypes,
    colors,
    garmentProfile,
    designLevel,
    setPlan,
    issues,
  };
}
