"use client";

import { useMemo, useState } from "react";
import type {
  Job,
  NormalizedCropRegion,
  ProductAssetEvidence,
  ProductAttributes,
  ProductDetailAssetKey,
  ProductProfile,
  ProductType,
  Project,
  ProjectAssets,
} from "@/lib/db";
import AssetUploadCard, { type LocalAsset } from "./AssetUploadCard";
import ImagePreviewDialog from "./ImagePreviewDialog";
import ClearAssetsButton from "./ClearAssetsButton";
import type { Runner } from "./types";
import { hasClearableSourceAssets } from "@/lib/asset-cleanup";
import { DEFAULT_PROTECTION_ITEMS } from "@/lib/product-structure";
import {useProjectDraftAutosave} from "./useProjectDraftAutosave";
import ColorCropper from "./ColorCropper";
import type { ProductionTaskType } from "@/lib/sku-production";

const TYPES: ProductType[] = ["上衣", "裤装", "连衣裙", "半身裙", "套装"];
const PRODUCTION_TASK_TYPES: ProductionTaskType[] = ["换装", "复色", "三姿势", "白底图", "高清优化", "局部修改", "产品展示图"];
const ATTRIBUTE_OPTIONS: Record<keyof ProductAttributes, string[]> = {
  mainColor: [
    "米白色",
    "白色",
    "黑色",
    "灰色",
    "粉色",
    "红色",
    "棕色",
    "蓝色",
    "绿色",
    "其他",
  ],
  printType: ["纯色", "花卉印花", "字母印花", "条纹", "格纹", "拼色", "其他"],
  neckline: ["圆领", "V领", "方领", "翻领", "立领", "一字领", "其他"],
  sleeveType: [
    "无袖",
    "短袖",
    "五分袖",
    "七分袖",
    "长袖",
    "泡泡袖",
    "荷叶袖",
    "其他",
  ],
  garmentLength: ["短款", "常规款", "中长款", "长款", "其他"],
  fit: ["紧身", "修身", "合体", "宽松", "廓形", "其他"],
  fabric: ["针织", "雪纺", "棉", "麻", "牛仔", "涤纶", "皮革", "其他"],
  fabricTexture: [
    "平纹",
    "罗纹",
    "粗针织",
    "细针织",
    "提花",
    "雪纺纹理",
    "牛仔纹理",
    "其他",
  ],
  weaveStructure: ["平针", "罗纹", "麻花", "提花", "网眼", "梭织", "其他"],
  gradientDesign: ["无渐变", "明暗渐变", "双色渐变", "多色渐变", "局部渐变", "其他"],
  colorBlockLayout: ["无拼色", "领口撞色", "袖口撞色", "下摆撞色", "多部位拼色", "不规则色块", "其他"],
  specialDesign: ["无特殊设计", "荷叶边", "镂空", "褶皱", "不对称", "立体装饰", "其他"],
  placketType: [
    "无门襟",
    "套头",
    "单排扣",
    "双排扣",
    "拉链",
    "暗扣",
    "系带",
    "其他",
  ],
  buttonCount: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "其他"],
  pocketDetails: [
    "无口袋",
    "左胸口袋",
    "右胸口袋",
    "双胸口袋",
    "两侧口袋",
    "贴袋",
    "插袋",
    "其他",
  ],
  trimColor: ["无包边", "白色", "黑色", "同色", "撞色", "其他"],
  printPosition: [
    "无印花",
    "左胸",
    "右胸",
    "正面中央",
    "背面",
    "袖口",
    "下摆",
    "满版",
    "其他",
  ],
  asymmetry: ["否", "是：左侧不同", "是：右侧不同", "其他"],
  belt: ["无", "有", "可拆卸", "其他"],
  drawstring: ["无", "领口抽绳", "腰部抽绳", "下摆抽绳", "其他"],
  pleats: ["无", "胸前", "腰部", "袖口", "下摆", "其他"],
  slit: ["无", "侧开叉", "后开叉", "前开叉", "其他"],
  transparency: ["不透", "微透", "半透", "其他"],
  lining: ["无", "有", "局部", "其他"],
  elasticity: ["无弹", "微弹", "中弹", "高弹", "其他"],
};
const ATTRIBUTE_LABELS: Record<keyof ProductAttributes, string> = {
  mainColor: "商品主颜色",
  printType: "印花类型",
  neckline: "领型",
  sleeveType: "袖型",
  garmentLength: "衣长",
  fit: "版型",
  fabric: "面料类型",
  fabricTexture: "面料纹理",
  weaveStructure: "织法与针法结构",
  gradientDesign: "渐变设计",
  colorBlockLayout: "色块与拼接布局",
  specialDesign: "特殊设计细节",
  placketType: "门襟类型",
  buttonCount: "纽扣数量",
  pocketDetails: "口袋数量和位置",
  trimColor: "包边颜色",
  printPosition: "印花位置",
  asymmetry: "是否左右不对称",
  belt: "是否有腰带",
  drawstring: "是否有抽绳",
  pleats: "是否有褶皱",
  slit: "是否有开叉",
  transparency: "透明度",
  lining: "是否有内衬",
  elasticity: "弹性",
};
const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_LABELS) as (keyof ProductAttributes)[];
const PRIMARY_ATTRIBUTE_KEYS: (keyof ProductAttributes)[] = [
  "fit",
  "garmentLength",
  "pocketDetails",
  "fabric",
  "fabricTexture",
  "printType",
  "trimColor",
  "colorBlockLayout",
];
const ADVANCED_ATTRIBUTE_KEYS = ATTRIBUTE_KEYS.filter(
  (key) => key !== "mainColor" && !PRIMARY_ATTRIBUTE_KEYS.includes(key),
);
type SingleAssetKey =
  | "garmentImage"
  | "productFrontImage"
  | "productBackImage"
  | "productDetailImage"
  | "printCloseupImage"
  | "buttonCloseupImage"
  | "pocketCloseupImage"
  | "necklineCloseupImage"
  | "sleeveCloseupImage"
  | "hemCloseupImage"
  | "stitchingCloseupImage"
  | "modelReferenceImage"
  | "fabricTextureImage"
  | "colorReferenceImage";
const ASSET_FIELDS: {
  key: SingleAssetKey;
  label: string;
  description: string;
  name: string;
  required?: boolean;
}[] = [
  {
    key: "garmentImage",
    label: "产品主图",
    description: "必填；上传后自动生成高清工作副本供识别与细节裁切",
    name: "garment",
    required: true,
  },
  {
    key: "productFrontImage",
    label: "产品正面图",
    description: "正面完整结构参考",
    name: "product-front",
  },
  {
    key: "productBackImage",
    label: "产品背面图",
    description: "背面版型与结构参考",
    name: "product-back",
  },
  {
    key: "productDetailImage",
    label: "细节图",
    description: "领口、袖口、下摆等细节",
    name: "product-detail",
  },
  {
    key: "printCloseupImage",
    label: "印花特写",
    description: "印花位置、颜色与边缘参考",
    name: "print-closeup",
  },
  {
    key: "buttonCloseupImage",
    label: "纽扣特写",
    description: "纽扣数量、位置、颜色与形状参考",
    name: "button-closeup",
  },
  {
    key: "pocketCloseupImage",
    label: "口袋特写",
    description: "口袋数量、位置、开口和形状参考",
    name: "pocket-closeup",
  },
  {
    key: "necklineCloseupImage",
    label: "领口特写",
    description: "领型、门襟、包边与结构参考",
    name: "neckline-closeup",
  },
  {
    key: "sleeveCloseupImage",
    label: "袖口特写",
    description: "袖型、袖口和车线结构参考",
    name: "sleeve-closeup",
  },
  {
    key: "hemCloseupImage",
    label: "下摆 / 裤脚特写",
    description: "下摆、裤脚、开叉与包边参考",
    name: "hem-closeup",
  },
  {
    key: "stitchingCloseupImage",
    label: "车线 / 拼接特写",
    description: "车线走向、拼接边界和针距参考",
    name: "stitching-closeup",
  },
  {
    key: "modelReferenceImage",
    label: "默认模特参考图",
    description: "可选，换装步骤也可单独上传",
    name: "model-reference",
  },
  {
    key: "fabricTextureImage",
    label: "面料特写",
    description: "近距离面料和纹理参考",
    name: "fabric-texture",
  },
  {
    key: "colorReferenceImage",
    label: "多颜色参考图",
    description: "可选，用于后续逐颜色复色",
    name: "color-reference",
  },
];
const PRIMARY_ASSET_KEYS: SingleAssetKey[] = ["garmentImage", "modelReferenceImage"];
const primaryAssetFields = ASSET_FIELDS.filter((field) => PRIMARY_ASSET_KEYS.includes(field.key));
const supplementalAssetFields = ASSET_FIELDS.filter((field) => !PRIMARY_ASSET_KEYS.includes(field.key));
const PRODUCT_DETAIL_ASSET_KEYS = new Set<ProductDetailAssetKey>([
  "productFrontImage", "productBackImage", "productDetailImage", "printCloseupImage",
  "buttonCloseupImage", "pocketCloseupImage", "necklineCloseupImage", "sleeveCloseupImage",
  "hemCloseupImage", "stitchingCloseupImage", "modelReferenceImage", "fabricTextureImage",
  "colorReferenceImage",
]);
const DETAIL_CROP_KEYS = new Set<ProductDetailAssetKey>([
  "productFrontImage", "productBackImage", "productDetailImage", "printCloseupImage",
  "buttonCloseupImage", "pocketCloseupImage", "necklineCloseupImage", "sleeveCloseupImage",
  "hemCloseupImage", "stitchingCloseupImage", "fabricTextureImage", "colorReferenceImage",
]);
function isProductDetailAssetKey(key: keyof ProjectAssets): key is ProductDetailAssetKey {
  return PRODUCT_DETAIL_ASSET_KEYS.has(key as ProductDetailAssetKey);
}
type ProductTab = "basic" | "attributes" | "assets" | "description" | "tags";
const PRODUCT_TABS: { id: ProductTab; label: string; description: string }[] = [
  { id: "basic", label: "基础信息", description: "SKU、名称与项目安排" },
  { id: "attributes", label: "AI识别与保护", description: "AI回填，用户确认" },
  { id: "assets", label: "图片素材", description: "商品图、细节图与参考图" },
  { id: "description", label: "细节要求", description: "提供给生成模型的约束" },
  { id: "tags", label: "标签与备注", description: "检索标签、项目备注与统计" },
];

export default function ProductDetailsPanel({
  p,
  jobs,
  busy,
  run,
  persistAsset,
  deleteAsset,
  clearSourceAssets,
  saveProject,
  onNext,
}: {
  p: Project;
  jobs: Job[];
  busy: boolean;
  run: Runner;
  persistAsset: (
    file: File | undefined,
    key: keyof ProjectAssets,
    name: string,
    index?: number,
  ) => Promise<string>;
  deleteAsset: (key: keyof ProjectAssets, index?: number) => Promise<void>;
  clearSourceAssets: () => Promise<Project>;
  saveProject: (patch: Partial<Project>) => Promise<Project>;
  onNext: () => void;
}) {
  const initialProfile = p.profile || {};
  const [sku, setSku] = useState(p.sku),
    [name, setName] = useState(p.productName),
    [type, setType] = useState<ProductType>(p.productType);
  const [profile, setProfile] = useState<ProductProfile>({
    ...initialProfile,
    priority: initialProfile.priority || "normal",
    reviewStatus: initialProfile.reviewStatus || "draft",
    tags: initialProfile.tags || [],
    protectionItems: initialProfile.protectionItems || DEFAULT_PROTECTION_ITEMS,
    attributes: initialProfile.attributes || {},
  });
  const [tagInput, setTagInput] = useState(""),
    [saved, setSaved] = useState(true),
    [preview, setPreview] = useState<string | null>(null),
    [activeTab, setActiveTab] = useState<ProductTab>("basic"),
    [analyzing, setAnalyzing] = useState(false),
    [analysisNotice, setAnalysisNotice] = useState(""),
    [enhancing, setEnhancing] = useState(false),
    [enhanceNotice, setEnhanceNotice] = useState("");
  const [visualAnalyzing, setVisualAnalyzing] = useState(false);
  const [visualNotice, setVisualNotice] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [planNotice, setPlanNotice] = useState("");
  const [planConfirmed, setPlanConfirmed] = useState(p.productionTask?.status === "ready");
  const [selectedTaskTypes, setSelectedTaskTypes] = useState<ProductionTaskType[]>(p.productionTask?.taskTypes || []);
  const [assetEvidence, setAssetEvidence] = useState<Project["assetEvidence"]>(() => ({ ...(p.assetEvidence || {}) }));
  const [cropTarget, setCropTarget] = useState<{key: ProductDetailAssetKey; label: string} | null>(null);
  const [cropDraft, setCropDraft] = useState<NormalizedCropRegion | undefined>();
  const aiFilled = useMemo(() => Object.fromEntries(
    Object.entries(assetEvidence || {})
      .filter(([, evidence]) => evidence.source === "ai_crop")
      .map(([key, evidence]) => [key, evidence]),
  ) as Record<string, ProductAssetEvidence>, [assetEvidence]);
  const [assets, setAssets] = useState<Record<string, LocalAsset>>(() =>
    Object.fromEntries([
      ...ASSET_FIELDS.map((field) => [
        field.key,
        {
          url: p.assets[field.key],
          name: p.assets[field.key] ? "已保存素材" : undefined,
          status: p.assets[field.key] ? "saved" : "idle",
        },
      ]),
      [
        "otherMaterial",
        {
          url: p.assets.otherMaterialImages?.[0],
          name: p.assets.otherMaterialImages?.[0] ? "其他素材" : undefined,
          status: p.assets.otherMaterialImages?.[0] ? "saved" : "idle",
        },
      ],
    ]),
  );
  useProjectDraftAutosave(p.id,{sku:sku.trim()||p.sku,productName:name.trim(),productType:type,profile},500);
  const changeProfile = (patch: Partial<ProductProfile>) => {
    setProfile((value) => ({ ...value, ...patch }));
    setSaved(false);
  };
  const changeAttribute = (key: keyof ProductAttributes, value: string) => {
    changeProfile({ attributes: { ...profile.attributes, [key]: value } });
  };
  const checks = useMemo(
    () => [
      { label: "基础信息完整", ok: Boolean(sku.trim() && name.trim() && type) },
      { label: "服装主图完整", ok: Boolean(assets.garmentImage?.url) },
      {
        label: "细节素材完整",
        ok: Boolean(
          assets.productDetailImage?.url || assets.fabricTextureImage?.url,
        ),
      },
      {
        label: "全部商品属性完整",
        ok: ATTRIBUTE_KEYS.every((key) => Boolean(profile.attributes?.[key]?.trim())),
      },
      { label: "细节描述完整", ok: Boolean(profile.detailDescription?.trim()) },
      { label: "标签信息完整", ok: Boolean(profile.tags?.length) },
    ],
    [
      sku,
      name,
      type,
      assets,
      profile.attributes,
      profile.detailDescription,
      profile.tags,
    ],
  );
  const completeness = Math.round(
    (checks.filter((item) => item.ok).length / checks.length) * 100,
  );
  const previewImages = Object.values(assets).flatMap((asset) =>
    asset.url ? [asset.url] : [],
  );
  const pendingAiReviewCount = Object.values(assetEvidence || {}).filter(
    (evidence) => evidence.source === "ai_crop" && !evidence.confirmed,
  ).length;
  const enhancement=p.productImageEnhancement;
  const enhancementSummary=enhancement
    ?enhancement.status==="needs_review"
      ?`已增强至 ${enhancement.enhancedWidth}×${enhancement.enhancedHeight}px；原图仍偏模糊，请补充清晰细节图或人工确认`
      :enhancement.blurDetected
        ?`检测到原图模糊，已增强至 ${enhancement.enhancedWidth}×${enhancement.enhancedHeight}px，后续优先参考高清副本`
        :`高清工作图 ${enhancement.enhancedWidth}×${enhancement.enhancedHeight}px 已就绪，后续优先参考`
    :"高清工作图已生成，后续识别与真实区域裁切优先使用";

  async function saveAsset(
    asset: LocalAsset,
    key: keyof ProjectAssets,
    fileName: string,
    index?: number,
  ) {
    const stateKey = key === "otherMaterialImages" ? "otherMaterial" : key;
    setAssets((value) => ({
      ...value,
      [stateKey]: { ...asset, status: "uploading" },
    }));
    try {
      const url = await persistAsset(asset.file, key, fileName, index);
      setAssets((value) => ({
        ...value,
        [stateKey]: { ...asset, url, file: undefined, status: "saved" },
      }));
      if (isProductDetailAssetKey(key)) {
        const now = new Date().toISOString();
        setAssetEvidence((value) => ({
          ...(value || {}),
          [key]: {
            source: "manual",
            sourceImage: url,
            confidence: 1,
            needsReview: false,
            confirmed: true,
            reason: "用户人工上传并确认",
            createdAt: now,
            reviewedAt: now,
          },
        }));
      }
      setSaved(false);
    } catch (error) {
      setAssets((value) => ({
        ...value,
        [stateKey]: {
          ...asset,
          status: "failed",
          error: error instanceof Error ? error.message : "上传失败",
        },
      }));
      throw error;
    }
  }
  async function removeAsset(key: keyof ProjectAssets, index?: number) {
    await deleteAsset(key, index);
    const stateKey = key === "otherMaterialImages" ? "otherMaterial" : key;
    setAssets((value) => ({ ...value, [stateKey]: { status: "idle" } }));
    if (isProductDetailAssetKey(key)) {
      setAssetEvidence((value) => {
        const next = { ...(value || {}) };
        delete next[key];
        return next;
      });
    }
    setSaved(false);
  }
  async function clearAllAssets() {
    await clearSourceAssets();
    setAssets(
      Object.fromEntries([
        ...ASSET_FIELDS.map((field) => [field.key, { status: "idle" }]),
        ["otherMaterial", { status: "idle" }],
      ]),
    );
    setAssetEvidence({});
    setPreview(null);
  }
  function addTag() {
    const tag = tagInput.trim();
    if (!tag || profile.tags?.includes(tag)) return;
    changeProfile({ tags: [...(profile.tags || []), tag] });
    setTagInput("");
  }
  async function persist(advance = false) {
    const next = await saveProject({
      sku: sku.trim(),
      productName: name.trim(),
      productType: type,
      profile,
      ...(advance
        ? {
            currentStep: Math.max(2, p.currentStep),
            status: p.status === "未开始" ? "进行中" : p.status,
            stepStatuses: { ...p.stepStatuses, "1": "confirmed", "2": "ready" },
          }
        : {}),
    });
    setSku(next.sku);
    setName(next.productName);
    setProfile(next.profile || profile);
    setSaved(true);
    if (advance) onNext();
  }
  async function enhanceProduct() {
    if (!assets.garmentImage?.url)
      throw new Error("请先上传产品主图，再一键变高清");
    setEnhancing(true);
    setEnhanceNotice("");
    try {
      const response = await fetch(`/api/projects/${p.id}/enhance-product`, {
          method: "POST",
        }),
        data = (await response.json()) as {
          enhancedUrl?: string;
          enhancedSize?: { width: number; height: number };
          method?: "ai" | "deterministic";
          aiError?: string;
          error?: string;
        };
      if (!response.ok || !data.enhancedUrl)
        throw new Error(data.error || "一键变高清失败");
      setEnhanceNotice(
        data.method === "ai"
          ? `已 AI 超分变高清：${data.enhancedSize?.width}×${data.enhancedSize?.height}px，后续识别、细节裁切、换装与复色将优先使用高清副本。`
          : `已变高清（AI 增强失败已回退确定性放大）：${data.enhancedSize?.width}×${data.enhancedSize?.height}px。${data.aiError || ""}`,
      );
    } finally {
      setEnhancing(false);
    }
  }
  async function analyzeProduct() {
    if (!assets.garmentImage?.url)
      throw new Error("请先在图片素材中上传一张产品主图");    setAnalyzing(true);
    setAnalysisNotice("");
    try {
      const response = await fetch(`/api/projects/${p.id}/product-analyze`, {
          method: "POST",
        }),
        data = (await response.json()) as {
          productType?: ProductType;
          attributes?: ProductAttributes;
          detailDescription?: string;
          protectionItems?: string[];
          error?: string;
        };
      if (!response.ok) throw new Error(data.error || "产品图片识别失败");
      if (data.productType) setType(data.productType);
      setProfile((current) => ({
        ...current,
        attributes: { ...current.attributes, ...data.attributes },
        detailDescription: data.detailDescription || current.detailDescription,
        protectionItems: data.protectionItems?.length
          ? data.protectionItems
          : current.protectionItems,
        reviewStatus: "awaiting_review",
      }));
      setSaved(false);
      setAnalysisNotice(
        "识别完成：商品属性和细节要求已回填，请检查修改后再保存。",
      );
    } finally {
      setAnalyzing(false);
    }
  }
  async function analyzeVisual() {
    if (!assets.garmentImage?.url)
      throw new Error("请先上传产品主图，再自动识别细节图");
    setVisualAnalyzing(true);
    setVisualNotice("");
    try {
      const response = await fetch(`/api/projects/${p.id}/visual-analyze`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        project?: Project;
        regions?: Array<{
          assetKey: string;
          label: string;
          upscalePath: string;
          confidence: number;
          needsReview: boolean;
        }>;
        missing?: Array<{ label: string }>;
        error?: string;
      };
      if (!response.ok || !data.regions)
        throw new Error(data.error || "产品细节识别失败");
      const filledKeys = new Set(data.regions.map((region) => region.assetKey));
      const next = { ...assets };
      const evidence: Record<string, ProductAssetEvidence> = {};
      for (const region of data.regions) {
        const stateKey = region.assetKey as keyof typeof assets;
        if (!(stateKey in next)) continue;
        next[stateKey] = {
          url: region.upscalePath,
          name: region.label,
          status: "saved",
        };
        evidence[region.assetKey] = {
          source: "ai_crop",
          confidence: region.confidence,
          needsReview: true,
          confirmed: false,
          reason: "AI建议裁图，等待用户人工确认",
          createdAt: new Date().toISOString(),
        };
      }
      setAssets(next);
      setAssetEvidence(data.project?.assetEvidence || { ...(assetEvidence || {}), ...evidence });
      setSaved(false);
      const filled = Array.from(filledKeys).length;
      const missing = (data.missing || []).map((item) => item.label).join("、");
      setVisualNotice(
        `步骤1完成：AI已从产品主图裁剪并高清放大 ${filled} 个补充素材参考${missing ? `；未识别到：${missing}` : ""}。请逐张确认、重新框选或人工上传。`,
      );
    } finally {
      setVisualAnalyzing(false);
    }
  }
  async function undoAiFill() {
    const keys = Object.keys(aiFilled);
    if (!keys.length) return;
    const assetKeys = keys.filter((key) =>
      ASSET_FIELDS.some((field) => field.key === key),
    ) as SingleAssetKey[];
    for (const key of assetKeys) await deleteAsset(key);
    const remainingEvidence = Object.fromEntries(
      Object.entries(assetEvidence || {}).filter(
        ([key]) => !assetKeys.includes(key as SingleAssetKey),
      ),
    );
    setAssetEvidence(remainingEvidence);
    setAssets((value) => {
      const next = { ...value };
      for (const key of assetKeys) next[key] = { status: "idle" };
      return next;
    });
    setSaved(false);
    setVisualNotice("已撤销 AI 自动填充的细节图，对应槽位已清空，可重新手动上传或再次识别。");
  }
  function openDetailCrop(key: ProductDetailAssetKey, label: string) {
    if (!assets.garmentImage?.url) throw new Error("请先上传并保存产品主图");
    setCropTarget({ key, label });
    setCropDraft(assetEvidence?.[key]?.boundingBox || { x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
  }
  async function saveDetailCrop() {
    if (!cropTarget || !cropDraft) throw new Error("请先在产品主图上框选参考区域");
    const target = cropTarget;
    const response = await fetch(`/api/projects/${p.id}/detail-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetKey: target.key, boundingBox: cropDraft }),
    });
    const data = await response.json() as {url?: string; evidence?: ProductAssetEvidence; error?: string};
    if (!response.ok || !data.url || !data.evidence) throw new Error(data.error || "保存人工细节裁图失败");
    setAssets((value) => ({ ...value, [target.key]: { url: data.url, name: `${target.label} · 人工框选`, status: "saved" } }));
    setAssetEvidence((value) => ({ ...(value || {}), [target.key]: data.evidence! }));
    setCropTarget(null);
    setCropDraft(undefined);
    setSaved(false);
    setVisualNotice(`${target.label}已按你指定的产品主图位置裁剪并确认，换装时会作为高优先级细节参考。`);
  }
  async function confirmAiDetail(assetKey: ProductDetailAssetKey) {
    const response = await fetch(`/api/projects/${p.id}/detail-assets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetKey }),
    });
    const data = await response.json() as {evidence?: ProductAssetEvidence; error?: string};
    if (!response.ok || !data.evidence) throw new Error(data.error || "确认补充素材失败");
    setAssetEvidence((value) => ({ ...(value || {}), [assetKey]: data.evidence! }));
    setSaved(false);
  }
  const successful = jobs.filter(
    (job) =>
      job.status === "success" ||
      job.status === "confirmed" ||
      job.status === "needs_review",
  ).length;

  async function confirmProductionPlan() {
    setPlanBusy(true);
    setPlanNotice("");
    try {
      const response = await fetch(`/api/projects/${p.id}/production-plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, taskTypes: selectedTaskTypes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生产方案确认失败");
      setPlanConfirmed(true);
      setPlanNotice("生产方案已确认，可以进入换装、复色或三姿势流程");
    } catch (error) {
      setPlanNotice(error instanceof Error ? error.message : "生产方案确认失败");
    } finally {
      setPlanBusy(false);
    }
  }

  return (
    <div className="product-details-page">
      {p.productionTask && (
        <section className="card sku-production-plan-card">
          <div className="panel-head">
            <div><span className="section-kicker">Excel / WPS 生产方案</span><h2>{p.sku} · AI 视觉生产任务</h2><small>来源：{p.spreadsheetSource?.fileName || "商品表格"} · 第 {p.spreadsheetSource?.rowNumber || "-"} 行</small></div>
            <span className={`badge ${planConfirmed ? "success" : "wait"}`}>{planConfirmed ? "方案已确认" : p.productionTask.status === "draft" ? "等待AI分析" : "需要人工确认"}</span>
          </div>
          <div className="sku-production-plan-grid">
            <div><small>服装分类</small><b>{p.garmentProfile?.primaryCategory || p.productType} / {p.garmentProfile?.secondaryCategory || "待识别"}</b></div>
            <div><small>任务类型</small><b>{p.productionTask.taskTypes.join("、") || "待确认"}</b></div>
            <div><small>设计复杂度</small><b>{p.productionTask.designLevel === "complex" ? "复杂款（逐色参考）" : p.productionTask.designLevel === "simple" ? "简单款（快速生产）" : "待人工确认"}</b></div>
            <div><small>Top 3 姿势</small><b>{p.productionTask.recommendedPoses.slice(0, 3).map((item) => item.poseGroupId).join("、") || "姿势库暂无匹配"}</b></div>
          </div>
          <div className="sku-plan-task-editor"><b>确认要执行的流程</b><div>{PRODUCTION_TASK_TYPES.map((taskType) => <label className="check-item" key={taskType}><input type="checkbox" checked={selectedTaskTypes.includes(taskType)} disabled={planConfirmed} onChange={() => setSelectedTaskTypes((items) => items.includes(taskType) ? items.filter((item) => item !== taskType) : [...items, taskType])}/>{taskType}</label>)}</div></div>
          {p.productionTask.issues.length > 0 && <div className="notice warning"><b>需要处理</b><span>{p.productionTask.issues.join("；")}</span></div>}
          {p.garmentProfile?.protectedDetails.length ? <div className="sku-plan-rules"><b>服装细节锁定</b><span>{p.garmentProfile.protectedDetails.slice(0, 6).join("；")}</span></div> : null}
          <div className="actions"><button type="button" className="primary" disabled={planBusy || planConfirmed || !selectedTaskTypes.length} onClick={() => void confirmProductionPlan()}>{planBusy ? "确认中…" : planConfirmed ? "生产方案已确认" : "确认生产方案"}</button>{planNotice && <small>{planNotice}</small>}</div>
        </section>
      )}
      <nav className="product-tabs" aria-label="商品资料分区" role="tablist">
        {PRODUCT_TABS.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            <small>{tab.description}</small>
          </button>
        ))}
      </nav>
      {!saved && (
        <div className="product-unsaved">
          商品资料有未保存修改，请完成后点击保存。
        </div>
      )}
      {activeTab === "basic" && (
        <div className="product-tab-panel product-basic-view" role="tabpanel">
          <section className="card">
            <div className="panel-head">
              <h2>基础信息</h2>
              <span
                className={`badge ${profile.reviewStatus === "confirmed" ? "success" : "wait"}`}
              >
                {profile.reviewStatus === "confirmed"
                  ? "已确认"
                  : profile.reviewStatus === "awaiting_review"
                    ? "等待人工确认"
                    : "草稿"}
              </span>
            </div>
            <div className="product-basic-grid">
              <label className="field">
                SKU编号 *
                <input
                  value={sku}
                  onChange={(e) => {
                    setSku(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <label className="field">
                商品名称 *
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <label className="field">
                商品类型 *
                <select
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as ProductType);
                    setSaved(false);
                  }}
                >
                  {TYPES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                商品主颜色
                <input
                  value={profile.attributes?.mainColor || ""}
                  onChange={(e) => changeAttribute("mainColor", e.target.value)}
                  placeholder="例如：米白色"
                />
              </label>
              <label className="field">
                季节
                <select
                  value={profile.season || ""}
                  onChange={(e) => changeProfile({ season: e.target.value })}
                >
                  <option value="">请选择</option>
                  {["春季", "夏季", "秋季", "冬季", "四季"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                优先级
                <select
                  value={profile.priority || "normal"}
                  onChange={(e) =>
                    changeProfile({
                      priority: e.target.value as ProductProfile["priority"],
                    })
                  }
                >
                  <option value="low">低</option>
                  <option value="normal">普通</option>
                  <option value="high">高</option>
                  <option value="urgent">紧急</option>
                </select>
              </label>
            </div>
          </section>
          <aside className="card product-check">
            <div className="panel-head">
              <h2>资料检查与建议</h2>
              <span className="badge">{completeness}%</span>
            </div>
            <div
              className="completeness-ring"
              style={
                {
                  "--complete": `${completeness * 3.6}deg`,
                } as React.CSSProperties
              }
            >
              <strong>{completeness}%</strong>
              <small>资料完整度</small>
            </div>
            <div className="check-list">
              {checks.map((item) => (
                <div className={item.ok ? "ok" : "missing"} key={item.label}>
                  <span>{item.ok ? "✓" : "!"}</span>
                  {item.label}
                </div>
              ))}
            </div>
            <div className="suggestion-box">
              <b>当前建议</b>
              <p>
                {checks.every((item) => item.ok)
                  ? "商品资料完整，可以进入换装。"
                  : checks
                      .filter((item) => !item.ok)
                      .map((item) => item.label.replace("完整", ""))
                      .join("、") + "仍需补充。"}
              </p>
            </div>
            <small className="truth-note">
              这里是基于真实已保存资料的规则检查，不会冒充AI识别结果。
            </small>
          </aside>
        </div>
      )}
      {activeTab === "attributes" && (
        <div className="product-tab-panel" role="tabpanel">
          <section className="card">
            <div className="product-auto-analysis">
              <div className="product-auto-analysis-upload">
                <AssetUploadCard
                  label="产品图片"
                  description="点击、拖拽或粘贴图片；上传后会自动转换为可识别格式"
                  value={assets.garmentImage || { status: "idle" }}
                  onChange={(asset) =>
                    run(() => saveAsset(asset, "garmentImage", "garment"))
                  }
                  onPreview={() =>
                    assets.garmentImage?.url &&
                    setPreview(assets.garmentImage.url)
                  }
                  onDelete={
                    assets.garmentImage?.url
                      ? () => run(() => removeAsset("garmentImage"))
                      : undefined
                  }
                />
              </div>
              <div className="product-auto-analysis-copy">
                <h2>产品图片智能识别</h2>
                <p>
                  {assets.garmentImage?.url
                    ? p.assets.garmentEnhancedImage
                      ? "产品图片与高清工作副本已保存，识别和细节裁切将优先使用高清副本。"
                      : "产品图片已保存，可以自动填写商品属性和细节要求。"
                    : "请在左侧上传一张产品图片，再开始智能识别。"}
                </p>
                {p.assets.garmentEnhancedImage && <span className={`success-text${enhancement?.status==="needs_review"?" enhancement-review":""}`}>✓ {enhancementSummary} · 原产品图保持不变</span>}
                {enhanceNotice && (
                  <span className="success-text">{enhanceNotice}</span>
                )}
                {analysisNotice && (
                  <span className="success-text">{analysisNotice}</span>
                )}
              </div>
              <div className="product-auto-analysis-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || enhancing || analyzing || !assets.garmentImage?.url}
                  onClick={() => run(enhanceProduct)}
                >
                  {enhancing
                    ? "正在变高清…"
                    : p.assets.garmentEnhancedImage
                      ? "⚡ 重新一键变高清"
                      : "⚡ 一键变高清"}
                </button>
                <button
                  type="button"
                  className="primary product-auto-analysis-action"
                  disabled={busy || analyzing || !assets.garmentImage?.url}
                  onClick={() => run(analyzeProduct)}
                >
                  {analyzing ? "正在识别…" : "▶ 自动识别商品资料"}
                </button>
              </div>
            </div>
            <div className="panel-head product-ai-review-head">
              <div><h2>AI 识别结果</h2><small>版型、长度、口袋、纹理和印花由 AI 先填，你只需确认或修改</small></div>
              <div className="product-ai-review-actions">
                <span className={`badge ${profile.reviewStatus === "confirmed" ? "success" : "wait"}`}>{profile.reviewStatus === "confirmed" ? "已确认" : "待确认"}</span>
                {profile.reviewStatus !== "confirmed" && <button type="button" className="secondary" onClick={()=>changeProfile({reviewStatus:"confirmed"})}>确认识别结果</button>}
              </div>
            </div>
            <div className="attribute-grid attribute-grid-primary">
              {PRIMARY_ATTRIBUTE_KEYS.map((key) => {
                const currentValue=profile.attributes?.[key] || "";
                const options=ATTRIBUTE_OPTIONS[key];
                return (
                <label className="field" key={key}>
                  {ATTRIBUTE_LABELS[key]}
                  <select
                    value={currentValue}
                    onChange={(e) => changeAttribute(key, e.target.value)}
                  >
                    <option value="">请选择</option>
                    {currentValue&&!options.includes(currentValue)&&<option value={currentValue}>{currentValue}</option>}
                    {options.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                    <option>无法从图片确认</option>
                  </select>
                </label>
                );
              })}
            </div>
            <details className="product-advanced-attributes">
              <summary>高级属性 <span>{ADVANCED_ATTRIBUTE_KEYS.filter(key=>profile.attributes?.[key]).length}/{ADVANCED_ATTRIBUTE_KEYS.length} 已填</span></summary>
              <div className="attribute-grid">
                {ADVANCED_ATTRIBUTE_KEYS.map((key) => {
                  const currentValue=profile.attributes?.[key] || "";
                  const options=ATTRIBUTE_OPTIONS[key];
                  return <label className="field" key={key}>{ATTRIBUTE_LABELS[key]}<select value={currentValue} onChange={(e)=>changeAttribute(key,e.target.value)}><option value="">请选择</option>{currentValue&&!options.includes(currentValue)&&<option value={currentValue}>{currentValue}</option>}{options.map(item=><option key={item}>{item}</option>)}<option>无法从图片确认</option></select></label>;
                })}
              </div>
            </details>
            <h3 className="section-label">重点保护</h3>
            <div className="protection-grid">
              {[
                ...new Set([
                  ...DEFAULT_PROTECTION_ITEMS,
                  ...(profile.protectionItems || []),
                ]),
              ].map((item) => (
                <label className="check-item" key={item}>
                  <input
                    type="checkbox"
                    checked={(profile.protectionItems || []).includes(item)}
                    onChange={() =>
                      changeProfile({
                        protectionItems: (
                          profile.protectionItems || []
                        ).includes(item)
                          ? (profile.protectionItems || []).filter(
                              (value) => value !== item,
                            )
                          : [...(profile.protectionItems || []), item],
                      })
                    }
                  />
                  {item}
                </label>
              ))}
            </div>
          </section>
        </div>
      )}
      {activeTab === "assets" && (
        <div className="product-tab-panel" role="tabpanel">
          <section className="card product-assets">
            <div className="panel-head">
              <h2>图片素材</h2>
              <div className="panel-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || visualAnalyzing || !assets.garmentImage?.url}
                  onClick={() => run(analyzeVisual)}
                >
                  {visualAnalyzing ? "正在生成补充素材参考…" : "步骤1：AI参考生成补充素材"}
                </button>
                {Object.keys(aiFilled).length > 0 && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => run(undoAiFill)}
                  >
                    撤销AI填充
                  </button>
                )}
                <span>{previewImages.length} 张已保存</span>
                <ClearAssetsButton
                  disabled={busy || !hasClearableSourceAssets(p)}
                  onConfirm={clearAllAssets}
                />
              </div>
            </div>
            {visualNotice && <div className="notice">{visualNotice}</div>}
            <div className="product-detail-material-flow">
              <div><b>1</b><span><strong>AI先生成参考</strong><small>只从产品主图真实可见区域定位、裁剪和放大，不补造图片中不存在的细节。</small></span></div>
              <div><b>2</b><span><strong>你来人工检查与补充</strong><small>逐张确认；不准确时从产品主图重新框选，或直接上传替换。</small></span></div>
              <div><b>3</b><span><strong>确认后进入换装</strong><small>只有人工上传、人工框选或经你确认的 AI 裁图，才作为高优先级细节参考。</small></span></div>
            </div>
            <div className="product-assets-priority">
              <div><h3>主要素材</h3><small>换装最常用，优先上传和查看</small></div>
              <div className="product-assets-grid primary-assets-grid">
              {primaryAssetFields.map((field) => (
                <div className="product-asset-card" key={field.key}>
                  <AssetUploadCard
                    label={`${field.label}${field.required ? " *" : ""}`}
                    description={field.description}
                    value={assets[field.key] || { status: "idle" }}
                    onChange={(asset) =>
                      run(() => saveAsset(asset, field.key, field.name))
                    }
                    onDelete={
                      assets[field.key]?.url
                        ? () => run(() => removeAsset(field.key))
                        : undefined
                    }
                    onPreview={() =>
                      assets[field.key]?.url &&
                      setPreview(assets[field.key].url!)
                    }
                  />
                  {field.key === "garmentImage" && p.assets.garmentEnhancedImage && (
                    <span className={`product-enhanced-source-status${enhancement?.status==="needs_review"?" review":""}`}>✓ {enhancementSummary}</span>
                  )}
                  {aiFilled[field.key] && (
                    <span className={`ai-fill-badge ${aiFilled[field.key].needsReview ? "review" : ""}`}>
                      AI裁剪 · 置信度 {Math.round((aiFilled[field.key].confidence ?? 0) * 100)}%
                      {aiFilled[field.key].needsReview ? " · 建议确认" : ""}
                    </span>
                  )}
                </div>
              ))}
              </div>
            </div>
            <details className="product-supplemental-assets" open>
              <summary>步骤2：人工检查与补充素材 <span>{supplementalAssetFields.filter(field=>assets[field.key]?.url).length + (assets.otherMaterial?.url ? 1 : 0)} 张已上传{pendingAiReviewCount ? ` · ${pendingAiReviewCount} 张待确认` : " · 已确认素材可用于换装"}</span></summary>
              <div className="product-assets-grid">
              {supplementalAssetFields.map((field) => {
                const detailKey = isProductDetailAssetKey(field.key) ? field.key : undefined;
                const evidence = detailKey ? assetEvidence?.[detailKey] : undefined;
                const aiPending = evidence?.source === "ai_crop" && !evidence.confirmed;
                const statusText = evidence?.source === "manual_crop"
                  ? "人工框选 · 已确认"
                  : evidence?.source === "manual"
                    ? "人工上传 · 已确认"
                    : evidence?.source === "ai_crop" && evidence.confirmed
                      ? "AI参考 · 已人工确认"
                      : aiPending
                        ? `AI参考 · 待人工检查${evidence.confidence !== undefined ? ` · ${Math.round(evidence.confidence * 100)}%` : ""}`
                        : assets[field.key]?.url
                          ? "历史素材 · 可检查或重新框选"
                          : "未补充";
                return <div className="product-asset-card" key={field.key}>
                  <AssetUploadCard label={field.label} description={field.description} value={assets[field.key] || { status: "idle" }} onChange={(asset)=>run(()=>saveAsset(asset,field.key,field.name))} onDelete={assets[field.key]?.url?()=>run(()=>removeAsset(field.key)):undefined} onPreview={()=>assets[field.key]?.url&&setPreview(assets[field.key].url!)}/>
                  <div className="detail-evidence-review">
                    <span className={`ai-fill-badge ${aiPending ? "review" : evidence?.confirmed ? "confirmed" : ""}`}>{statusText}</span>
                    <div>
                      {detailKey && aiPending && <button type="button" className="text-button" disabled={busy} onClick={()=>run(()=>confirmAiDetail(detailKey))}>确认这个细节</button>}
                      {detailKey && DETAIL_CROP_KEYS.has(detailKey) && <button type="button" className="text-button" disabled={busy || !assets.garmentImage?.url} onClick={()=>openDetailCrop(detailKey,field.label)}>{evidence?.boundingBox ? "查看位置 / 重新裁剪" : "从产品主图裁剪"}</button>}
                    </div>
                  </div>
                </div>;
              })}
              <div className="product-asset-card">
                <AssetUploadCard
                  label="其他素材"
                  description="可补充包装、配饰或说明图"
                  value={assets.otherMaterial || { status: "idle" }}
                  onChange={(asset) =>
                    run(() =>
                      saveAsset(
                        asset,
                        "otherMaterialImages",
                        "other-material-01",
                        0,
                      ),
                    )
                  }
                  onDelete={
                    assets.otherMaterial?.url
                      ? () => run(() => removeAsset("otherMaterialImages", 0))
                      : undefined
                  }
                  onPreview={() =>
                    assets.otherMaterial?.url &&
                    setPreview(assets.otherMaterial.url!)
                  }
                />
              </div>
              </div>
            </details>
            <p className="product-hint">
              平铺图和模特参考图用于换装；细节图与面料图用于帮助模型保护商品结构和纹理。
            </p>
          </section>
        </div>
      )}
      {activeTab === "description" && (
        <div className="product-tab-panel product-narrow-panel" role="tabpanel">
          <section className="card">
            <div className="panel-head">
              <h2>细节要求</h2>
              <small>给生成模型的重点保护提示</small>
            </div>
            <label className="field">
              <textarea
                className="product-detail-textarea"
                maxLength={800}
                value={profile.detailDescription || ""}
                onChange={(e) =>
                  changeProfile({ detailDescription: e.target.value })
                }
                placeholder="描述服装颜色、版型、领口、袖口、下摆、纽扣、印花、包边和面料等需要严格保持的细节。"
              />
              <span className="field-count">
                {profile.detailDescription?.length || 0}/800
              </span>
            </label>
            <div className="suggestion-box">
              <b>建议写法</b>
              <p>
                按“服装类别 → 版型与长度 → 领口袖口 → 纽扣印花 →
                包边与面料”的顺序描述，模型更容易准确理解。
              </p>
            </div>
          </section>
        </div>
      )}
      {activeTab === "tags" && (
        <div className="product-tab-panel product-tags-view" role="tabpanel">
          <section className="card">
            <div className="panel-head">
              <h2>标签与备注</h2>
              <small>方便检索、交接和人工复核</small>
            </div>
            <h3 className="section-label">标签管理</h3>
            <div className="tag-list">
              {profile.tags?.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() =>
                    changeProfile({
                      tags: profile.tags?.filter((item) => item !== tag),
                    })
                  }
                >
                  {tag} ×
                </button>
              ))}
            </div>
            <div className="tag-add">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="输入标签"
              />
              <button type="button" className="secondary" onClick={addTag}>
                添加
              </button>
            </div>
            <h3 className="section-label">项目备注</h3>
            <label className="field">
              <textarea
                maxLength={300}
                value={profile.notes || ""}
                onChange={(e) => changeProfile({ notes: e.target.value })}
                placeholder="填写交接事项、拍摄要求或审核说明"
              />
              <span className="field-count">
                {profile.notes?.length || 0}/300
              </span>
            </label>
          </section>
          <section className="card product-stats">
            <div className="panel-head">
              <h2>任务统计</h2>
              <small>真实任务数据</small>
            </div>
            <dl>
              <div>
                <dt>历史生成任务</dt>
                <dd>{jobs.length}</dd>
              </div>
              <div>
                <dt>成功／待审核</dt>
                <dd>{successful}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{new Date(p.createdAt).toLocaleString("zh-CN")}</dd>
              </div>
              <div>
                <dt>最后更新</dt>
                <dd>{new Date(p.updatedAt).toLocaleString("zh-CN")}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}
      <div className="product-save-bar">
        <div>
          <b>{PRODUCT_TABS.find((tab) => tab.id === activeTab)?.label}</b>
          <span>{saved ? "当前修改已保存" : "当前页面有未保存修改"}</span>
        </div>
        <button
          className="secondary"
          type="button"
          disabled={busy || saved}
          onClick={() => run(() => persist(false))}
        >
          保存资料
        </button>
        <button
          className="primary"
          type="button"
          disabled={
            busy || !sku.trim() || !name.trim() || !assets.garmentImage?.url
          }
          onClick={() => run(() => persist(true))}
        >
          保存并进入换装
        </button>
      </div>
      {cropTarget && assets.garmentImage?.url && (
        <div className="reference-crop-dialog-backdrop">
          <section className="reference-crop-dialog" role="dialog" aria-modal="true" aria-label={`从产品主图裁剪${cropTarget.label}`}>
            <div className="panel-head">
              <div><h2>从产品主图裁剪：{cropTarget.label}</h2><small>请只框住要重点参考的真实细节。保存后会高清放大，并作为人工确认的高优先级证据。</small></div>
              <button type="button" className="settings-dialog-close compact-close" onClick={()=>{setCropTarget(null);setCropDraft(undefined)}}>×</button>
            </div>
            <ColorCropper key={cropTarget.key} src={assets.garmentImage.url} region={cropDraft} onChange={setCropDraft} label={`产品主图中的${cropTarget.label}参考区域`}/>
            <div className="reference-crop-actions">
              <button type="button" className="secondary" onClick={()=>{setCropTarget(null);setCropDraft(undefined)}}>取消</button>
              <button type="button" className="primary" disabled={busy || !cropDraft} onClick={()=>run(saveDetailCrop)}>保存为重点细节参考</button>
            </div>
          </section>
        </div>
      )}
      {preview && (
        <ImagePreviewDialog
          images={previewImages}
          index={Math.max(0, previewImages.indexOf(preview))}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
