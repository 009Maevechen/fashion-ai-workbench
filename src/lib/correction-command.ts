export type CorrectionCommandPlan = {
  original: string;
  mustChange: string[];
  mustKeep: string[];
  forbiddenChanges: string[];
  referenceSources: string[];
  acceptanceCriteria: string[];
};

const MACHINE_PLAN_MARKER = "【强制命令JSONv2】";
const unique = (items: string[], limit: number) =>
  [
    ...new Set(items.map((item) => item.trim().slice(0, 300)).filter(Boolean)),
  ].slice(0, limit);

export function normalizeCorrectionCommandPlan(
  plan: CorrectionCommandPlan,
  original = plan.original,
): CorrectionCommandPlan {
  const raw = original.trim().slice(0, 800);
  const mustChange = unique(plan.mustChange, 12);
  const effectiveMustChange = mustChange.length ? mustChange : [raw];
  return {
    original: raw,
    mustChange: effectiveMustChange,
    mustKeep: unique(
      [
        ...plan.mustKeep.slice(0, 13),
        "未指定区域保持修正前图片不变",
        "保持原图人物身份、姿势、景别、构图和画质不变",
        "连续多次修改始终保持第一次修正前图片的分辨率、锐度、皮肤和面料质感",
      ],
      16,
    ),
    forbiddenChanges: unique(
      [
        ...plan.forbiddenChanges.slice(0, 13),
        "不得修改用户未指定区域",
        "不得降低清晰度、皮肤质感或服装面料细节",
        "不得整张重绘、反复压缩、过度降噪、磨皮或锐化",
      ],
      16,
    ),
    referenceSources: unique(
      [...plan.referenceSources, "修正前图片", "用户原始咒语"],
      8,
    ),
    acceptanceCriteria: unique(
      [
        ...(plan.acceptanceCriteria.length
          ? plan.acceptanceCriteria.slice(0, 13)
          : effectiveMustChange.slice(0, 13).map(
              (item) => `必须肉眼可见且精确完成：${item}`,
            )),
        "未指定区域必须与修正前图片一致",
        "输出分辨率不得低于第一次修正前图片，清晰度和细节解析力不得明显下降",
        "人物皮肤必须保持细腻、自然、真实，不得出现塑料感、脏感、噪点或涂抹感",
      ],
      16,
    ),
  };
}

export function deterministicCorrectionCommandPlan(
  request: string,
): CorrectionCommandPlan {
  const original = request.trim().slice(0, 800);
  const clauses = unique(
    original.split(/[；;。！？!?，,\n]+/).map((item) => item.trim()),
    24,
  );
  const keepPattern =
    /保持|保留|维持|锁定|原样|不变|不能改变|不得改变|不要改变|禁止改变/;
  const forbidPattern =
    /禁止|不得|不能|不要|不允许|切勿|其余|其他|只改|仅修改|除此之外/;
  const changePattern =
    /必须|一定|务必|改成|改为|变成|换成|修改|调整|增加|添加|去掉|移除|删除|减少|恢复|变宽|变窄|变长|变短|替换/;
  const referencePattern = /参考|按照|依照|根据|以.+为准|来自/;
  const mustKeep = clauses.filter((item) => keepPattern.test(item));
  const forbiddenChanges = clauses.filter((item) => forbidPattern.test(item));
  const mustChange = clauses.filter(
    (item) => changePattern.test(item) && !keepPattern.test(item),
  );
  const references = clauses.filter((item) => referencePattern.test(item));
  const effectiveChanges = mustChange.length ? mustChange : [original];
  const acceptanceCriteria = effectiveChanges.flatMap((item) => {
    const criteria = [`必须肉眼可见且精确完成：${item}`];
    if (
      /[0-9一二三四五六七八九十两]+\s*(个|颗|枚|条|道|排|处|只|件)/.test(item)
    )
      criteria.push(`数量必须精确一致，不得多、少、漏或重复：${item}`);
    if (
      /黑|白|灰|红|橙|黄|绿|蓝|紫|棕|咖|卡其|米|奶|杏|驼|藏青|颜色|色/.test(
        item,
      )
    )
      criteria.push(`指定部位的颜色必须准确命中：${item}`);
    return criteria;
  });
  for (const item of mustKeep) {
    acceptanceCriteria.push(`必须保持且不得发生变化：${item}`);
    if (
      /黑|白|灰|红|橙|黄|绿|蓝|紫|棕|咖|卡其|米|奶|杏|驼|藏青|颜色|色/.test(
        item,
      )
    )
      acceptanceCriteria.push(`指定保留部位的颜色必须与修正前一致：${item}`);
  }
  return normalizeCorrectionCommandPlan({
    original,
    mustChange: effectiveChanges,
    mustKeep,
    forbiddenChanges,
    referenceSources: references,
    acceptanceCriteria,
  });
}

export function correctionCommandText(plan: CorrectionCommandPlan) {
  const normalized = normalizeCorrectionCommandPlan(plan);
  const line = (title: string, items: string[]) =>
    `${title}：${items.length ? items.join("；") : "无额外要求"}`;
  return [
    "【最高优先级：用户强制命令】",
    `用户原始咒语（不得删改或弱化）：${normalized.original}`,
    line("必须修改项", normalized.mustChange),
    line("必须保留项", normalized.mustKeep),
    line("禁止修改项", normalized.forbiddenChanges),
    line("参考来源", normalized.referenceSources),
    line("验收条件", normalized.acceptanceCriteria),
    "执行顺序：先锁定必须保留项和禁止修改区，再逐项执行必须修改项，最后逐条按验收条件自检。不得用近似结果代替明确数量、颜色、部位、形状或增删要求。",
    "执行优先级：用户强制命令 > 用户人工确认规则 > 产品图真实细节 > 系统自动建议 > 默认Prompt。未指定区域默认保持修正前图片不变。必须修改项未真实命中，或必须保留/禁止修改项被破坏，结果即为失败。",
    "【无损画质继承】第一次执行咒语前的图片是整个连续修改链的永久画质基线。每次只编辑指定部位及必要过渡像素，禁止整图重绘或重新编码式劣化；输出分辨率不得降低，锐度、噪点水平、真实皮肤毛孔与光泽、服装面料纹理和边缘细节不得弱于该基线。若不能同时完成修改并保持画质，必须判定失败，不得输出低清结果冒充成功。",
    `${MACHINE_PLAN_MARKER}${JSON.stringify(normalized)}`,
  ].join("\n");
}

export function correctionPlanFromText(
  text: string,
): CorrectionCommandPlan | undefined {
  if (!text.includes("【最高优先级：用户强制命令】")) return undefined;
  const markerIndex = text.lastIndexOf(MACHINE_PLAN_MARKER);
  if (markerIndex >= 0) {
    const encoded = text
      .slice(markerIndex + MACHINE_PLAN_MARKER.length)
      .split("\n", 1)[0]
      ?.trim();
    if (encoded)
      try {
        return normalizeCorrectionCommandPlan(
          JSON.parse(encoded) as CorrectionCommandPlan,
        );
      } catch {
        /* 兼容旧任务中的人类可读格式 */
      }
  }
  const value = (label: string) =>
    text.match(new RegExp(`${label}：([^\\n]+)`))?.[1]?.trim() || "";
  const items = (label: string) => {
    const content = value(label);
    return !content || content === "无额外要求"
      ? []
      : content
          .split("；")
          .map((item) => item.trim())
          .filter(Boolean);
  };
  const original = value("用户原始咒语（不得删改或弱化）");
  if (!original) return undefined;
  return normalizeCorrectionCommandPlan({
    original,
    mustChange: items("必须修改项"),
    mustKeep: items("必须保留项"),
    forbiddenChanges: items("禁止修改项"),
    referenceSources: items("参考来源"),
    acceptanceCriteria: items("验收条件"),
  });
}
