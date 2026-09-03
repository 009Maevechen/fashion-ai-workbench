import "server-only";
import {z} from "zod";
import type {CorrectionCommandPlan} from "../correction-command";
import {localImage,toDataUrl} from "./storage";
import {resizeToJpeg} from "../image-limits";
import {resolveQcModel} from "./provider-settings";
import {requestMultiVisionJson} from "./vision-chat";

const schema=z.object({passed:z.boolean(),score:z.number().min(0).max(100),summary:z.string().min(1).max(500),missed:z.array(z.string().max(250)).max(12),violations:z.array(z.string().max(250)).max(12)});
export async function checkCorrectionCommand(sourceUrl:string,resultUrl:string,plan:CorrectionCommandPlan){
  const runtime=await resolveQcModel();
  const images=await Promise.all([sourceUrl,resultUrl].map(async url=>toDataUrl(await resizeToJpeg(await localImage(url),1280,88),"image/jpeg")));
  const result=schema.parse(await requestMultiVisionJson(runtime,images,"你是严格的图片修改指令验收员，只按可见证据逐条验收，不得宽松放行。",`第1张是修改前原图，第2张是咒语修改结果。用户原始命令：${plan.original}\n必须修改：${plan.mustChange.join("；")}\n必须保留：${plan.mustKeep.join("；")}\n禁止修改：${plan.forbiddenChanges.join("；")}\n验收条件：${plan.acceptanceCriteria.join("；")}\n逐条核对：必须修改项需真实可见命中；未指定区域、保留项和禁止修改项不得变化；数量必须精确，颜色和部位必须准确；画质与皮肤质感不得下降。任一硬性要求未命中则 passed=false。返回 JSON：{"passed":boolean,"score":0到100,"summary":"结论","missed":["未命中的命令"],"violations":["被错误改变的内容"]}`));
  return {...result,checkedAt:new Date().toISOString(),model:runtime.model};
}
