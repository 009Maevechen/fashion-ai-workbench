/**
 * WPS / Excel 批量生产：把「F 列生产备注」翻译成真实生产任务，并给出预检状态。
 * 纯逻辑模块，不依赖 IO，方便测试。
 */

export type WorkflowStage = "tryon" | "pose" | "recolor";

export type ProductionSetPlan = {
  /** 需要生产的套内序号（0=第一套，1=第二套…）。 */
  sets: number[];
  /** 只做到某个阶段为止（截止复色前 = "recolor"）。 */
  stopBefore?: WorkflowStage;
  needsReview: boolean;
  reason?: string;
};

const CN_NUM: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function parseNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (/^\d+$/.test(text)) return Number(text);
  if (/^十[一二三四五六七八九]?$/.test(text)) return 10 + (text.length > 1 ? CN_NUM[text[1]] || 0 : 0);
  if (/^[一二三四五六七八九]十[一二三四五六七八九]?$/.test(text)) {
    const tens = CN_NUM[text[0]] || 0;
    const ones = text.length > 2 ? CN_NUM[text[2]] || 0 : 0;
    return tens * 10 + ones;
  }
  if (text.length === 1 && CN_NUM[text] !== undefined) return CN_NUM[text];
  return undefined;
}

/** 从备注识别「截止到某个阶段」（例如「在复色之前的图片」）。 */
export function parseStopBefore(notes: string): WorkflowStage | undefined {
  const text = notes.trim();
  if (!text) return undefined;
  if (/截止\s*复色前|复色\s*之?前|不做复色|到复色前|停在复色前|复色以前的图片|在复色之前/.test(text)) return "recolor";
  if (/截止\s*三?姿势前|三姿势\s*之?前|不做三姿势|到三姿势前|在姿势之前/.test(text)) return "pose";
  if (/截止\s*换装前|换装\s*之?前|不做换装|到换装前|在换装之前/.test(text)) return "tryon";
  return undefined;
}

/**
 * 解析生产套数：
 * - 「做一套」→ 第一套
 * - 「做两套上架」→ 第一、二套
 * - 「做第二套图」→ 只做第二套
 * - 「做第二套图，在复色之前的图片」→ 只做第二套，且截止复色前
 * - 无法确认 → needsReview=true，禁止猜测
 */
export function parseProductionSets(notes: string): ProductionSetPlan {
  const text = notes.trim();
  const stopBefore = parseStopBefore(text);
  if (!text) return { sets: [0], stopBefore, needsReview: false };

  // 「第 N 套」只做指定套
  const nth = /第\s*([0-9一二三四五六七八九十两]+)\s*套/.exec(text);
  if (nth) {
    const index = parseNumber(nth[1]);
    if (index !== undefined && index >= 1 && index <= 20) {
      return { sets: [index - 1], stopBefore, needsReview: false };
    }
  }

  // 「做 N 套」做前 N 套
  const count = /做?\s*([0-9一二三四五六七八九十两]+)\s*套/.exec(text);
  if (count) {
    const total = parseNumber(count[1]);
    if (total !== undefined && total >= 1 && total <= 20) {
      return { sets: Array.from({ length: total }, (_, i) => i), stopBefore, needsReview: false };
    }
  }

  // 有明确截止阶段但没写套数，按第一套处理
  if (stopBefore) return { sets: [0], stopBefore, needsReview: false };

  return { sets: [], stopBefore, needsReview: true, reason: "生产备注无法确定做几套，需要人工确认" };
}

/** 多套文件命名：第一套=原名，第二套=名（1），第三套=名（2）… */
export function productionSetFileName(originalName: string, setIndex: number): string {
  if (setIndex <= 0) return originalName;
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const ext = dot > 0 ? originalName.slice(dot) : "";
  return `${base}（${setIndex}）${ext}`;
}

export function productionSetNames(originalName: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => productionSetFileName(originalName, index));
}

export type PrecheckStatus = "READY" | "NEEDS_REVIEW" | "BLOCKED";

export type PrecheckInput = {
  sku: string;
  hasProductImage?: boolean;
  hasModelImage?: boolean;
  setPlan: ProductionSetPlan;
  /** 未知角色的图片数量。 */
  unknownImageCount?: number;
  /** 其他必须人工处理的字段问题。 */
  fieldIssues?: string[];
  /** 备注要求做换装/三姿势但没有模特图。 */
  needsModelButMissing?: boolean;
};

/**
 * 预检状态：
 * - BLOCKED：缺 SKU 或产品图，无法开始。
 * - NEEDS_REVIEW：套数/图片角色/字段有不确定项，或需要模特图却没有。
 * - READY：字段齐全且套数明确，可直接进入生产。
 */
export function resolvePrecheckStatus(input: PrecheckInput): PrecheckStatus {
  if (!input.sku?.trim() || input.hasProductImage === false) return "BLOCKED";
  if (
    input.setPlan.needsReview ||
    (input.setPlan.sets.length === 0) ||
    (input.unknownImageCount || 0) > 0 ||
    (input.fieldIssues?.length || 0) > 0 ||
    input.needsModelButMissing
  )
    return "NEEDS_REVIEW";
  return "READY";
}
