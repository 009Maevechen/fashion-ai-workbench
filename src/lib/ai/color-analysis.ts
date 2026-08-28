import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { resolveProductAnalysisModel } from "./provider-settings";
import { localImage, toDataUrl } from "./storage";
import { requestTextJson, requestVisionText } from "./vision-chat";
import { readableColorName } from "../color-palette";
import { extractStructuredColors } from "../structured-color";

const colorItem = z.object({
  name: z.string().min(1).max(30),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  trimColorName: z.string().min(1).max(30),
  trimHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
const schema = z.object({
  colors: z.array(colorItem).min(1).max(6),
});

/** 让视觉模型用标准色名描述每个候选色，区分相近颜色。 */
async function nameColors(hexes: string[], runtime: Awaited<ReturnType<typeof resolveProductAnalysisModel>>) {
  if (!hexes.length) return {};
  const named = await requestTextJson(
    runtime,
    "你是服装颜色命名助手。依据每个 HEX 精确判断最贴切的服装颜色名，必须重点区分相近颜色：黑色/深灰/炭灰、白色/米白/奶白/象牙白、棕色/深棕/咖色/巧克力棕、卡其/驼色/杏色/米色、蓝色/深蓝/藏蓝/牛仔蓝、绿色/军绿/墨绿/橄榄绿。只返回合法 JSON。",
    `颜色列表：${hexes.join(", ")}\n\n返回 {"names": {"#HEX": "颜色名"}}，为每个 HEX 输出最准确的颜色名，不要笼统地都用“棕色”或“蓝色”。`,
  );
  const parsed = (named as { names?: Record<string, string> }) || {};
  return parsed.names || {};
}

export type GarmentColorResult = {
  primaryColor: { name: string; hex: string; confidence: number } | null;
  secondaryColors: Array<{ name: string; hex: string; confidence: number }>;
  accentColors: Array<{ name: string; hex: string; confidence: number }>;
  colorVariants: Array<{ name: string; hex: string; order: number; confidence: number }>;
  confidence: number;
  needsReview: boolean;
  reviewReason?: string;
  /** 兼容旧接口：复色流程使用的色卡列表 */
  colors: Array<{ name: string; hex: string; trimColorName: string; trimHex: string }>;
};

export async function analyzeGarmentColors(imageUrl: string): Promise<GarmentColorResult> {
  const [visionRuntime, textRuntime, input] = await Promise.all([
    resolveProductAnalysisModel(),
    resolveProductAnalysisModel("fallback"),
    localImage(imageUrl),
  ]);
  const normalized = await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  // 本地结构化聚类：白平衡 + 排除肤色/阴影/高光，得到主/辅/点缀色的真实 HEX 与占比
  const structured = await extractStructuredColors(normalized);
  const allHexes = [...new Set((structured.colorVariants || []).map((item) => item.hex))];

  try {
    // 视觉模型：定位服装区域并给出标准颜色名与边饰色
    const observation = await requestVisionText(
      visionRuntime,
      toDataUrl(normalized, "image/jpeg"),
      "你是电商服装图片颜色识别助手。先定位图片中的目标服装区域，只分析服装本体，彻底忽略人物、背景、皮肤、头发、鞋子、道具、衣架、文字、阴影和高光。必须区分相近颜色，不确定时明确说明，不要猜测。",
      "观察服装的颜色构成：主色、辅色（面积较大的第二种颜色，如侧条纹、拼接）、点缀色（纽扣、印花、小面积边饰）。重点区分相近颜色：黑色/深灰/炭灰、白色/米白/奶白、棕色/深棕/咖色、卡其/驼色/杏色/米色、蓝色/深蓝/藏蓝/牛仔蓝、绿色/军绿/墨绿/橄榄绿。同时说明领口、袖口、下摆、包边的边饰色。如果同一张图里有多个颜色款式，分别列出每个款式的颜色和位置顺序。",
    );
    const parsed = schema.parse(
      await requestTextJson(
        textRuntime,
        "你是服装色卡资料整理助手。只能依据图片识别结果整理色卡，必须只返回合法 JSON。",
        `图片识别结果：\n${observation}\n\n返回 {"colors": [...]}，最多6项；每项包含 name（主体色名称）、hex、trimColorName（边饰色名称）、trimHex。所有 HEX 必须为 #RRGGBB。`,
      ),
    );

    // 用视觉模型的色卡名称覆盖本地聚类的颜色名，保证名称准确
    const visionNames = await nameColors(allHexes, textRuntime);
    const nameOf = (hex: string) => {
      const upper = hex.toUpperCase();
      if (visionNames[upper]) return visionNames[upper];
      return readableColorName(upper, []);
    };

    const primaryHex = structured.primaryColor?.hex.toUpperCase();
    const visionPrimary = parsed.colors[0];
    const primaryColor = primaryHex
      ? {
          name: visionNames[primaryHex] || visionPrimary?.name || readableColorName(primaryHex, []),
          hex: primaryHex,
          confidence: structured.primaryColor!.confidence,
        }
      : null;

    const secondaryColors = structured.secondaryColors.map((item) => ({
      name: nameOf(item.hex),
      hex: item.hex,
      confidence: item.confidence,
    }));
    const accentColors = structured.accentColors.map((item) => ({
      name: nameOf(item.hex),
      hex: item.hex,
      confidence: item.confidence,
    }));
    const colorVariants = structured.colorVariants.map((item) => ({
      name: nameOf(item.hex),
      hex: item.hex,
      order: item.order,
      confidence: item.confidence,
    }));

    // 多色款：如果视觉模型识别到多个颜色，且本地聚类也确认了多种主色，合并为变体列表
    const needsReview = structured.needsReview || parsed.colors.length > 4;
    const reviewReason = structured.needsReview
      ? structured.reviewReason
      : parsed.colors.length > 4
        ? "识别到多种颜色款式，建议人工确认"
        : undefined;

    return {
      primaryColor,
      secondaryColors,
      accentColors,
      colorVariants,
      confidence: primaryColor ? Math.round(primaryColor.confidence * 100) : structured.confidence,
      needsReview,
      reviewReason,
      colors: parsed.colors,
    };
  } catch (error) {
    throw new Error(`颜色识别失败：${error instanceof Error ? error.message : "未知错误"}`);
  }
}
