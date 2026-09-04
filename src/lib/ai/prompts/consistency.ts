import type { Job, Project } from "@/lib/db";
import type { GenerationWorkflow } from "../types";

export function garmentConsistencyPrompt(workflow:GenerationWorkflow,project:Project,job:Job){
  const profile=project.profile?.attributes||{};
  const known=[profile.fabric,profile.fabricTexture,profile.weaveStructure,profile.gradientDesign,profile.colorBlockLayout,profile.specialDesign,profile.neckline,profile.sleeveType,profile.trimColor].filter(Boolean).join("；");
  const color=project.targetColors?.find(item=>item.id===job.targetColorId);
  const variantDetails=color?.designDetails?.length?color.designDetails.join("、"):"以第2张颜色款整件参考图为准";
  const variantMaterial=color?.materialFeatures||"以第2张颜色款整件参考图为准";
  const variantColors=color?.colorRegions?.length?color.colorRegions.map(region=>`${region.part}=${region.colorName}${region.hex?`(${region.hex})`:""}`).join("、"):"逐部位以第2张参考图真实可见颜色为准";
  const occlusionRule=color?.occlusion&&color.occlusion!=="none"
    ?color.occlusionPolicy==="extend_uniform"&&color.isUniformColor
      ?`参考图存在遮挡，但已确认整件为统一单色；检查遮挡区域是否只延续可见主体色，且没有虚构异色细节。`
      :`参考图存在遮挡且不可安全推断；结果不得为不可见区域虚构颜色或设计，否则判为不一致并列入人工审核。`
    :"参考图无遮挡推断问题。";
  const colorRule=workflow==="recolor"
    ?`这是复色结果。第1张已确认姿势图锁定人物、姿势、动作、景别、构图、背景和画面样式；第2张当前颜色款整件参考图是该色款颜色、面料和设计的唯一主要依据；第3张是待检结果。名称“${color?.outputName||color?.name||job.colorName||"未命名"}”、HEX ${color?.hex||color?.baseHex||"未提供"}、边饰辅助名 ${color?.trimColorName||"未提供"} ${color?.trimHex||""} 只作辅助，若和第2张图片冲突必须以图片为准。局部配色：${variantColors}。结构化设计：${variantDetails}。面料特征：${variantMaterial}。${occlusionRule}必须同时检查：1）第3张的人物、动作、景别、构图和背景是否与第1张一致；2）第3张的主体色、包边、条纹、拼接、扣子、印花和面料分区颜色是否与第2张逐部位一致；3）口袋、条纹、拼接、扣子、印花、包边、车线、线条位置、面料分区是否与第2张一对一一致；4）面料纹理、织法、光泽、厚薄、垂感是否清晰稳定。任何其他颜色款设计混入、只改颜色而遗漏该款设计、人物动作或构图改变，consistent 必须为 false。任何文字覆盖图片、只改主色而遗漏局部配色、无依据补全遮挡区，也必须判为不一致。`
    :workflow==="tryon"
      ?"这是服装换装候选图。必须与原产品服装一比一复刻：服装类型、版型、材质、面料、纹理、颜色、包边和全部设计细节完全一致；模特、姿势、构图和背景差异不算服装不一致。重点检查：1）是否把模特原服装的款式、颜色、图案或细节混入了结果（这是不一致，必须判失败）；2）生成服装的材质、面料、织法、纹理是否与原产品一比一一致；3）扣子数量、扣子位置、扣子大小、扣子颜色、扣子形状、扣子排列方式和门襟左右方向是否与原产品图完全一致（扣子多一颗、少一颗、错位、变形、糊掉、消失都判不一致）；4）口袋、条纹、印花、拼接、包边、车线数量与位置是否一致。"
      :"这是三种姿势结果。服装类型、颜色、面料材质、纹理、织法、包边配色及全部设计细节也必须和原产品一比一一致，姿势、人物和构图变化不算服装不一致；扣子数量、位置、大小、颜色、形状、排列和门襟方向必须与原产品一致，口袋、条纹、印花、拼接、包边、车线不得改变。";
  const imageOrder=workflow==="recolor"?"图片顺序：第1张是上一流程已确认姿势图，第2张是当前颜色款整件服装设计参考，第3张是复色结果图。":"图片顺序：第1张是原产品服装基准图，第2张是生成结果图。只比较核心商品服装，不比较人物姿势、脸、背景、构图和裁切。";
  return `${imageOrder}\n${colorRule}\n已知产品细节：${known||"请完全根据原产品图判断"}。\n逐项检查版型轮廓、领口袖口肩线下摆、长度和比例、面料材质、织法与纹理密度方向、渐变与色块布局、包边、纽扣印花及特殊设计。看不清时必须列入 issues 并判为 needs review，不能猜测。score 为服装设计一致度；严重结构、材质、纹理、错误边色、人物动作或构图任一项错误时 consistent 必须为 false。返回 JSON：{"consistent":boolean,"score":0到100,"summary":"中文结论","issues":["具体差异"],"checks":{"silhouette":boolean,"material":boolean,"texture":boolean,"construction":boolean,"details":boolean,"color":boolean}}`;
}
