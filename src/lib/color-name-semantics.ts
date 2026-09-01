// 颜色名称语义解析：把“白色衣服黑色边”“黑色裤子白色条纹”“卡其色上衣黑色扣子”
// 这类带设计信息的色卡名称，解析成结构化部位配色，供生成逻辑真正执行。
// 名称不是备注，而是生成规则的一部分。

export type GarmentPart = "边" | "条纹" | "包边" | "扣子" | "拼接" | "印花" | "撞色" | "线条";

export type ColorNameSemantics = {
  /** 主体颜色名称（去掉服装名词与部位描述后的主色） */
  mainColor: string;
  /** 各部位配色，例如 [{part:"边",color:"黑色"},{part:"条纹",color:"白色"}] */
  parts: Array<{ part: GarmentPart; color: string }>;
  /** 无法可靠解析结构关系时为 true，需要人工确认 */
  needsReview: boolean;
  /** 解析说明，供界面展示 */
  summary: string;
};

// 部位关键词（长词优先，避免“边”误匹配“包边/条纹”）。
const PART_PATTERNS: Array<{ part: GarmentPart; pattern: RegExp }> = [
  { part: "包边", pattern: /包边/g },
  { part: "条纹", pattern: /条纹|条杠|条纹边/g },
  { part: "拼接", pattern: /拼接/g },
  { part: "印花", pattern: /印花/g },
  { part: "撞色", pattern: /撞色/g },
  { part: "扣子", pattern: /扣子|纽扣|钮扣/g },
  { part: "线条", pattern: /线条|描边/g },
  { part: "边", pattern: /边/g },
];

// 颜色词（长词优先，避免“白色”里的“白”被单独匹配）。
// 同时收录带“色”完整形式与单字颜色（“白包边”里的“白”即“白色”）。
const COLOR_WORDS = [
  "巧克力棕","巧克力棕色","橄榄绿","橄榄绿色","牛仔蓝","薰衣草紫","鼠尾草绿","雾霾蓝","雾灰色","雾紫色",
  "象牙白","象牙白色","奶油白","米白色","燕麦色","浅杏色","杏仁色","浅卡其","浅卡其色","黄褐卡其","黄褐卡其色","深卡其","深卡其色","卡其色",
  "浅驼色","焦糖棕","焦糖棕色","驼棕色","栗棕色","深咖啡","深咖啡色","酒红色","砖红色","正红色","珊瑚粉","珊瑚粉色",
  "裸粉色","藕粉色","葡萄紫","葡萄紫色","藏青色","天蓝色","墨绿色","草绿色","姜黄色","柠檬黄","柠檬黄色",
  "橘棕色","炭黑色","深灰色","中灰色","浅灰色","冷白色",
  "黑色","白色","灰色","棕色","咖啡色","咖啡","红色","粉色","蓝色","绿色","黄色","金色","银色",
  "驼色","杏色","米色","藏蓝","藏蓝色","军绿","军绿色","藏青","藏青色","紫色","青色",
  "黑","白","灰","棕","红","粉","蓝","绿","黄","金","银","紫","青",
];

/** 单字颜色归一化为标准颜色名，避免模型误解“白”等单字。 */
function normalizeColorWord(color: string): string {
  const map: Record<string, string> = {
    "黑": "黑色", "白": "白色", "灰": "灰色", "棕": "棕色", "红": "红色",
    "粉": "粉色", "蓝": "蓝色", "绿": "绿色", "黄": "黄色", "金": "金色",
    "银": "银色", "紫": "紫色", "青": "青色",
  };
  return map[color] || color;
}

function buildColorRegex(): RegExp {
  return new RegExp(COLOR_WORDS.join("|"), "g");
}

/** 判断字符串是否以颜色词结尾（去除“色”字后仍算）。 */
function stripSuffix(value: string): string {
  return value.replace(/色$/u, "");
}

/**
 * 解析色卡名称的语义。返回主色、各部位配色、是否需要人工确认。
 * 例如：
 *   "白色衣服黑色边"        → 主色=白色，边=黑色
 *   "黑色裤子白色条纹"       → 主色=黑色，条纹=白色
 *   "卡其色上衣黑色扣子"     → 主色=卡其色，扣子=黑色
 *   "黑色白包边"            → 主色=黑色，包边=白色
 */
export function parseColorName(name: string): ColorNameSemantics {
  const raw = name.trim();
  if (!raw) {
    return { mainColor: "", parts: [], needsReview: false, summary: "" };
  }

  // 1. 找出所有颜色词的位置
  const colorRegex = buildColorRegex();
  const colorMatches: Array<{ color: string; index: number }> = [];
  let colorMatch: RegExpExecArray | null;
  while ((colorMatch = colorRegex.exec(raw)) !== null) {
    colorMatches.push({ color: normalizeColorWord(colorMatch[0]), index: colorMatch.index });
  }
  if (!colorMatches.length) {
    // 名称里没有可识别的颜色词，回退原文，标记需人工确认
    return { mainColor: raw, parts: [], needsReview: true, summary: `${raw}（无法识别颜色，需人工确认）` };
  }

  // 2. 剥离服装名词，确定主色（第一个颜色词为主色）
  const mainColor = colorMatches[0].color;
  const mainIndex = colorMatches[0].index;

  // 3. 找出部位关键词，并把紧邻其前的颜色词绑定为该部位色
  const parts: Array<{ part: GarmentPart; color: string }> = [];
  const claimedPartRanges: Array<[number, number]> = [];
  for (const { part, pattern } of PART_PATTERNS) {
    pattern.lastIndex = 0;
    let partMatch: RegExpExecArray | null;
    while ((partMatch = pattern.exec(raw)) !== null) {
      const partIndex = partMatch.index;
      // 该部位是否已被更长的词覆盖（例如“包边”覆盖“边”）
      const overlapped = claimedPartRanges.some(
        ([start, end]) => partIndex >= start && partIndex < end,
      );
      if (overlapped) continue;
      // 找部位词之前最近的颜色词（且不是主色本身，若主色紧邻则跳过）
      let partColor: string | null = null;
      for (let i = colorMatches.length - 1; i >= 0; i--) {
        const candidate = colorMatches[i];
        if (candidate.index < partIndex && candidate.index >= mainIndex) {
          // 跳过主色（主色在部位词前面但中间可能还有别的颜色词）
          if (i === 0) break;
          partColor = candidate.color;
          break;
        }
      }
      if (!partColor) {
        // 部位词前面没有独立颜色词（可能主色直接跟着部位），视为无法确定
        partColor = colorMatches[colorMatches.length - 1].color;
      }
      parts.push({ part, color: partColor });
      claimedPartRanges.push([partIndex, partIndex + partMatch[0].length]);
    }
  }

  // 4. 去重：同一部位只保留一个
  const seenParts = new Set<GarmentPart>();
  const uniqueParts = parts.filter((item) => {
    if (seenParts.has(item.part)) return false;
    seenParts.add(item.part);
    return true;
  });

  // 5. 判断是否需要人工确认：主色后若还有颜色词但没有对应部位，可能结构不明
  const trailingColors = colorMatches.filter((m) => m.index > mainIndex);
  const needsReview =
    trailingColors.length > 0 && uniqueParts.length === 0;

  // 6. 生成摘要
  const partsSummary = uniqueParts.map((p) => `${p.part}${stripSuffix(p.color)}`).join("、");
  const summary = partsSummary ? `${mainColor}（${partsSummary}）` : mainColor;

  return {
    mainColor,
    parts: uniqueParts,
    needsReview,
    summary,
  };
}

/** 把语义结果转成给生成模型的明确规则文本。 */
export function colorNameRuleText(semantics: ColorNameSemantics): string {
  if (!semantics.parts.length) return "";
  const lines = semantics.parts.map(
    (p) => `${p.part}必须是${p.color}，${p.part}颜色与主色“${semantics.mainColor}”形成明确区分，不得混同或省略`,
  );
  return `颜色名称语义规则（必须严格执行，名称怎么写就怎么生成）：主体颜色是“${semantics.mainColor}”。${lines.join("；")}。任何部位颜色错误、遗漏或与主色混同都视为生成失败。`;
}
