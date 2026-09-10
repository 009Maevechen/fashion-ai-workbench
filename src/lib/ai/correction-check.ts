import "server-only";
import { z } from "zod";
import type { CorrectionCommandPlan } from "../correction-command";
import { localImage, toDataUrl } from "./storage";
import { resizeToJpeg } from "../image-limits";
import { resolveQcModel } from "./provider-settings";
import { requestMultiVisionJson } from "./vision-chat";

const schema = z.object({
  passed: z.boolean(),
  score: z.coerce.number().min(0).max(100),
  summary: z.string().min(1).max(500),
  missed: z.array(z.string().max(250)).max(12),
  violations: z.array(z.string().max(250)).max(12),
});
export async function checkCorrectionCommand(
  sourceUrl: string,
  resultUrl: string,
  plan: CorrectionCommandPlan,
) {
  const runtime = await resolveQcModel();
  const images = await Promise.all(
    [sourceUrl, resultUrl].map(async (url) =>
      toDataUrl(
        await resizeToJpeg(await localImage(url), 1280, 88),
        "image/jpeg",
      ),
    ),
  );
  const result = schema.parse(
    await requestMultiVisionJson(
      runtime,
      images,
      "你是严格的图片修改指令验收员。逐条按照可见证据核对，不得因为整体看起来相近就宽松放行。",
      `第1张是修改前原图，第2张是咒语修改结果。\n用户原始命令：${plan.original}\n必须修改：${plan.mustChange.join("；")}\n必须保留：${plan.mustKeep.join("；")}\n禁止修改：${plan.forbiddenChanges.join("；")}\n参考来源：${plan.referenceSources.join("；")}\n验收条件：${plan.acceptanceCriteria.join("；")}\n强制核对顺序：1）逐条确认每个必须修改项在正确部位真实可见地完成；2）涉及数量时必须逐个计数，不能多、少、漏、重复；3）涉及颜色、形状、方向、位置、大小时必须分别准确；4）未指定区域以及必须保留、禁止修改区域必须与第1张一致；5）人物身份、脸、皮肤、姿势、景别、构图、背景、光线不得发生未授权变化；6）分辨率、锐度、皮肤细腻质感、服装纹理和边缘不能下降；7）不能出现多余设计、涂抹、伪影或AI杂质。任何一条证据不足、未精确命中或发生越界修改，passed 必须为 false，并把具体项目写入 missed 或 violations。只有全部命中且 score >= 90 才能通过。返回 JSON：{"passed":boolean,"score":0到100,"summary":"结论","missed":["未命中的命令"],"violations":["被错误改变的内容"]}`,
    ),
  );
  const passed =
    result.passed &&
    result.score >= 90 &&
    result.missed.length === 0 &&
    result.violations.length === 0;
  const missed = passed
    ? result.missed
    : result.missed.length
      ? result.missed
      : ["验收分数不足90分或缺少足够可见证据"];
  return {
    ...result,
    passed,
    missed,
    checkedAt: new Date().toISOString(),
    model: runtime.model,
  };
}
