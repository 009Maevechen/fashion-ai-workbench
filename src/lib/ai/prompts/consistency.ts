import type { Job, Project } from "@/lib/db";

export function garmentConsistencyPrompt(workflow:"tryon"|"pose"|"recolor",project:Project,job:Job){
  const profile=project.profile?.attributes||{};
  const known=[profile.fabric,profile.fabricTexture,profile.weaveStructure,profile.gradientDesign,profile.colorBlockLayout,profile.specialDesign,profile.neckline,profile.sleeveType,profile.trimColor].filter(Boolean).join("；");
  const color=project.targetColors?.find(item=>item.id===job.targetColorId);
  const colorRule=workflow==="recolor"
    ?`这是复色结果。主体服装必须变为目标颜色“${color?.outputName||color?.name||job.colorName||"未命名"}”（主色 ${color?.hex||color?.baseHex||"未提供"}，边饰 ${color?.trimColorName||"保持原设计"} ${color?.trimHex||""}）。允许并要求这一处目标颜色变化，但裤子、配饰、人物和其他非目标服装不得变色。`
    :workflow==="tryon"
      ?"这是服装换装候选图。必须与原产品服装一比一复刻：版型、材质、纹理、颜色、包边和全部设计细节一致；模特、姿势、构图和背景差异不算服装不一致。重点检查是否把模特原服装的款式、颜色、图案或细节混入了结果（这是不一致，必须判失败）。"
      :"这是三种姿势结果。服装颜色与包边配色也必须和原产品一致，姿势、人物和构图变化不算服装不一致。";
  return `图片顺序：第1张是原产品服装基准图，第2张是生成结果图。只比较核心商品服装，不比较人物姿势、脸、背景、构图和裁切。\n${colorRule}\n已知产品细节：${known||"请完全根据原产品图判断"}。\n逐项检查版型轮廓、领口袖口肩线下摆、长度和比例、面料材质、织法与纹理密度方向、渐变与色块布局、包边、纽扣印花及特殊设计。看不清时必须列入 issues 并判为 needs review，不能猜测。score 为服装设计一致度；严重结构、材质、纹理或错误边色任一项错误时 consistent 必须为 false。返回 JSON：{"consistent":boolean,"score":0到100,"summary":"中文结论","issues":["具体差异"],"checks":{"silhouette":boolean,"material":boolean,"texture":boolean,"construction":boolean,"details":boolean,"color":boolean}}`;
}
