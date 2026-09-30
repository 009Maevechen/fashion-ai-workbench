import "server-only";
import sharp from "sharp";
import crypto from "node:crypto";
import type {
  NormalizedCropRegion,
  ProductDetailAssetKey,
  ProductDetailRegionType,
  ProductVisualRegion,
} from "@/lib/db";
import { resolveProductAnalysisModel } from "./provider-settings";
import { localImage, saveOutput, toDataUrl } from "./storage";
import { requestVisionJson } from "./vision-chat";
import { safeSegment } from "./validators";
import { MAX_INPUT_PIXELS, resizeToJpeg } from "../image-limits";
import {
  filterValuableProductVisualDetection,
  parseProductVisualDetection,
  type NormalizedProductVisualDetection,
} from "./product-visual-regions-normalize";

const REGION_ASSET_KEY: Record<ProductDetailRegionType, ProductDetailAssetKey> = {
  frontView: "productFrontImage",
  backView: "productBackImage",
  detail: "productDetailImage",
  print: "printCloseupImage",
  buttons: "buttonCloseupImage",
  pockets: "pocketCloseupImage",
  neckline: "necklineCloseupImage",
  sleeve: "sleeveCloseupImage",
  hem: "hemCloseupImage",
  stitching: "stitchingCloseupImage",
  fabric: "fabricTextureImage",
  multiColor: "colorReferenceImage",
  modelReference: "modelReferenceImage",
};
export type ProductVisualDetection = NormalizedProductVisualDetection;

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 把每个候选框真正裁出来做成审核联系表。审核模型直接看到“口袋卡片里
 * 实际会显示什么”，而不是只看难以理解的归一化坐标，因此能识别前开叉、
 * 衣摆、背景或人物脸部冒充某个结构的错误。
 */
async function buildRegionAuditSheet(
  image: Buffer,
  regions: ProductVisualDetection["regions"],
): Promise<Buffer> {
  const meta = await sharp(image, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  if (!meta.width || !meta.height) throw new Error("产品主图尺寸无效，无法审核细节裁片");
  const columns = 3;
  const tileWidth = 420;
  const tileHeight = 340;
  const imageWidth = 396;
  const imageHeight = 270;
  const rows = Math.ceil(regions.length / columns);
  const tiles = await Promise.all(regions.map(async (region, index) => {
    const { left, top, cropWidth, cropHeight } = clampBox(region.boundingBox, meta.width!, meta.height!);
    const crop = await sharp(image, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize({ width: imageWidth, height: imageHeight, fit: "contain", background: "#ffffff" })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    const title = `${index + 1}. ${region.type} · ${region.label}`;
    const titleSvg = Buffer.from(
      `<svg width="${tileWidth}" height="54" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f1efff"/><text x="12" y="34" font-family="Arial, PingFang SC, sans-serif" font-size="18" font-weight="700" fill="#2f2855">${escapeSvgText(title)}</text></svg>`,
    );
    const tile = await sharp({
      create: { width: tileWidth, height: tileHeight, channels: 3, background: "#f7f7fa" },
    }).composite([
      { input: titleSvg, left: 0, top: 0 },
      { input: crop, left: 12, top: 60 },
    ]).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return {
      input: tile,
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight,
    };
  }));
  return sharp({
    create: {
      width: columns * tileWidth,
      height: Math.max(tileHeight, rows * tileHeight),
      channels: 3,
      background: "#ffffff",
    },
  }).composite(tiles).jpeg({ quality: 91, mozjpeg: true }).toBuffer();
}

export async function detectProductVisualRegions(
  imageUrl: string,
): Promise<ProductVisualDetection> {
  const runtime = await resolveProductAnalysisModel();
  const input = await localImage(imageUrl);
  // 细节定位需要比普通缩略图更多的像素，避免纽扣、口袋开口和车线在送模前丢失。
  const normalized = await resizeToJpeg(input, 1600, 90);
  const imageDataUrl = toDataUrl(normalized, "image/jpeg");
  const candidates = parseProductVisualDetection(
    await requestVisionJson(
      runtime,
      imageDataUrl,
      "你是电商服装商品图细节定位助手。你的裁图将直接作为后续换装模型的结构真值，因此宁缺毋滥。只标注图片中明确可见、类型准确且值得后续作图参考的服装区域；看不到、被遮挡、角度不符或信息价值低的区域一律放入 missing，不得猜测或用相似区域凑数。坐标使用归一化比例（0 到 1 的小数）。",
      `观察这张产品图，找出其中清晰可见、可用于后续生成时保护细节的独立区域：\n- frontView：完整服装正面\n- backView：真实完整背面\n- detail：最有价值的特殊结构\n- print：印花、刺绣或图案\n- buttons：纽扣及门襟关系\n- pockets：完整口袋开口及位置关系\n- neckline：完整领口、翻领或门襟上部\n- sleeve：袖型、袖口或肩部结构\n- hem：完整衣摆、裤脚或开叉\n- stitching：清晰可辨的车线、包边或拼接边界\n- fabric：足以判断材质的面料纹理\n- multiColor：至少两款完整、可比较的配色区域\n\n硬性规则：\n1. backView 只有在人物或服装真正背对镜头、能看到后领/后肩/后背结构时才能返回；看到脸、前翻领、前门襟或正面纽扣的照片绝不能标为背面。\n2. 完整视图必须保留服装关键边界，服装至少占裁图 65%；局部特写必须完整包含目标结构及少量定位上下文，尽量排除脸、手、腿、背景和其他色款。\n3. 纽扣、口袋、印花、车线和面料只有清晰到足以复刻形状、数量、位置或纹理时才返回。模糊的小黑点、开叉、腰带边缘不得冒充口袋或纽扣。\n4. 每种 type 最多一个最有价值的区域，总数最多 12；不可为了填满卡片而重复或猜测。\n5. 每个 region 还必须输出：usableForGeneration（是否真能指导后续作图）、visibleEvidence（画面中具体可见依据）、viewDirection（front/back/side/detail/unknown）、targetCoverage（目标细节占裁图比例 0~1）。\n6. confidence 低于 0.82、角度不确定或目标不完整时，usableForGeneration 必须为 false 并放入 missing。\n7. 只返回合法 JSON：{"regions":[{"type","label","confidence","boundingBox":{"x","y","width","height"},"needsReview","reason","usableForGeneration","visibleEvidence","viewDirection","targetCoverage"}],"missing":[{"type","label","reason"}]}`,
    ),
  );
  if (!candidates.regions.length) return candidates;

  // 第二次视觉审核直接查看每个实际候选裁片，只做“纠错与淘汰”。这样可避免
  // 第一遍把正面误认成背面，或把前开叉、衣摆等无意义小块写入口袋卡片。
  const auditSheet = await buildRegionAuditSheet(normalized, candidates.regions);
  const auditImageDataUrl = toDataUrl(auditSheet, "image/jpeg");
  const audited = parseProductVisualDetection(
    await requestVisionJson(
      runtime,
      auditImageDataUrl,
      "你是服装生产素材的最终质量审核员。图片是候选裁片联系表，每格标题标明编号和声称的结构类型。你必须根据格内真正显示的内容逐项核对语义；只保留类型完全正确、目标完整、清晰且能直接指导后续换装复刻的裁片。宁可留空，绝不凑数。",
      `联系表中的候选与以下 JSON 按编号一一对应：\n${JSON.stringify(candidates.regions)}\n\n审核要求：\n- 只能审核这些候选，禁止新增区域；通过时原样保留候选 boundingBox，不要按联系表重新计算坐标。\n- pockets 必须真实看见完整口袋开口、袋形或袋盖以及所在位置。前开叉、后开叉、衣摆缝隙、门襟、腰带、手部或阴影绝不是口袋，必须拒绝。\n- buttons 必须真实看见纽扣本体和门襟关系；小黑点、饰品、皮带扣不能冒充纽扣。\n- neckline 必须以完整领口/翻领为主体；只有脸部、头发或背景必须拒绝。sleeve 必须看见袖型或袖口边界。\n- hem 只接受完整衣摆、裤脚或开叉终止边；stitching 必须能清楚辨认车线、包边或拼接边界；fabric 必须足以判断真实纹理。\n- 正面与背面必须核实真实朝向；任何正面人物照都不得作为背面图。\n- 每格必须以目标结构为主体并保留必要上下文；模糊、过小、被遮挡或无实际复刻价值时必须拒绝。\n- 只有类型、范围、清晰度三项全部通过时 usableForGeneration 才为 true；不合格候选移入 missing，并具体说明画面实际是什么。\n- 输出格式与候选完全相同，并包含 usableForGeneration、visibleEvidence、viewDirection、targetCoverage。`,
    ),
  );
  // 审核联系表不是原图坐标系，因此审核阶段只允许通过/拒绝，不能篡改第一遍
  // 定位得到的框。若返回未知类型或新增候选则直接丢弃。
  const originalByType = new Map(candidates.regions.map((region) => [region.type, region]));
  const coordinateLocked: ProductVisualDetection = {
    regions: audited.regions.flatMap((region) => {
      const original = originalByType.get(region.type);
      return original ? [{ ...region, boundingBox: original.boundingBox }] : [];
    }),
    missing: audited.missing,
  };
  return filterValuableProductVisualDetection(coordinateLocked);
}

function clampBox(
  box: NormalizedCropRegion,
  width: number,
  height: number,
): { left: number; top: number; cropWidth: number; cropHeight: number } {
  const left = Math.max(0, Math.min(width - 1, Math.round(box.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(box.y * height)));
  const cropWidth = Math.min(width - left, Math.max(16, Math.round(box.width * width)));
  const cropHeight = Math.min(height - top, Math.max(16, Math.round(box.height * height)));
  return { left, top, cropWidth, cropHeight };
}

export async function cropAndUpscaleRegion(
  sku: string,
  sourceUrl: string,
  box: NormalizedCropRegion,
): Promise<{ cropPath: string; upscalePath: string; scale: number }> {
  const input = await localImage(sourceUrl);
  const meta = await sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  if (!meta.width || !meta.height) throw new Error("产品主图尺寸无效");
  // EXIF orientation 5~8 表示 90°/270° 旋转，宽高需要互换。
  const swap = (meta.orientation || 1) >= 5;
  const rotatedWidth = swap ? meta.height : meta.width;
  const rotatedHeight = swap ? meta.width : meta.height;
  const { left, top, cropWidth, cropHeight } = clampBox(box, rotatedWidth, rotatedHeight);
  const cropped = await sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  const requestedScale = cropWidth < 512 || cropHeight < 512 ? 4 : 2;
  const longestCropEdge = Math.max(cropWidth, cropHeight);
  // 高清主图可能已经达到 4096px。细节图不再无上限放大，避免 8K/16K
  // 裁图造成内存峰值；仍保持等比例、真实区域和可追溯坐标。
  const scale = Math.max(1, Math.min(requestedScale, 4096 / longestCropEdge));
  const outputWidth = Math.max(cropWidth, Math.round(cropWidth * scale));
  const outputHeight = Math.max(cropHeight, Math.round(cropHeight * scale));
  const upscaled = await sharp(cropped)
    .resize({ width: outputWidth, height: outputHeight, kernel: "lanczos3" })
    .sharpen({ sigma: 0.55 })
    .jpeg({ quality: 94, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const id = crypto.randomUUID();
  const cropPath = await saveOutput(
    sku,
    "source/visual-details/crop",
    `${safeSegment(String(id))}-crop.jpg`,
    cropped,
  );
  const upscalePath = await saveOutput(
    sku,
    "source/visual-details/upscale",
    `${safeSegment(String(id))}-${scale.toFixed(2)}x.jpg`,
    upscaled,
  );
  return { cropPath, upscalePath, scale };
}

export async function buildVisualRegion(
  sku: string,
  sourceUrl: string,
  detected: ProductVisualDetection["regions"][number],
): Promise<ProductVisualRegion> {
  const { cropPath, upscalePath, scale } = await cropAndUpscaleRegion(
    sku,
    sourceUrl,
    detected.boundingBox,
  );
  return {
    id: crypto.randomUUID(),
    type: detected.type,
    label: detected.label,
    confidence: detected.confidence,
    boundingBox: detected.boundingBox,
    cropPath,
    upscalePath,
    assetKey: REGION_ASSET_KEY[detected.type],
    needsReview: detected.needsReview,
    reason: detected.reason,
    scale,
  };
}
