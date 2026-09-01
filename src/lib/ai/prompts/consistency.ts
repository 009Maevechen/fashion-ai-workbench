import type { Job, Project } from "@/lib/db";

export function garmentConsistencyPrompt(workflow:"tryon"|"pose"|"recolor",project:Project,job:Job){
  const profile=project.profile?.attributes||{};
  const known=[profile.fabric,profile.fabricTexture,profile.weaveStructure,profile.gradientDesign,profile.colorBlockLayout,profile.specialDesign,profile.neckline,profile.sleeveType,profile.trimColor].filter(Boolean).join("；");
  const color=project.targetColors?.find(item=>item.id===job.targetColorId);
  const variantDetails=color?.designDetails?.length?color.designDetails.join("、"):"以第2张颜色款整件参考图为准";
  const variantMaterial=color?.materialFeatures||"以第2张颜色款整件参考图为准";
  const colorRule=workflow==="recolor"
    ?`这是复色结果。第1张已确认姿势图锁定人物、姿势、动作、景别、构图、背景和画面样式；第2张当前颜色款整件参考图锁定该色款颜色、面料和设计；第3张是待检结果。主体服装必须变为目标颜色“${color?.outputName||color?.name||job.colorName||"未命名"}”（主色 ${color?.hex||color?.baseHex||"未提供"}，边饰 ${color?.trimColorName||"保持该色款真实设计"} ${color?.trimHex||""}）。结构化设计：${variantDetails}。面料特征：${variantMaterial}。必须同时检查：1）第3张的人物、动作、景别、构图和背景是否与第1张一致；2）第3张的口袋、条纹、拼接、扣子、印花、包边、车线、线条位置、面料分区是否与第2张一对一一致；3）面料纹理、织法、光泽、厚薄、垂感是否清晰稳定。任何其他颜色款设计混入、只改颜色而遗漏该款设计、人物动作或构图改变，consistent 必须为 false。`
    :workflow==="tryon"
      ?"这是服装换装候选图。必须与原产品服装一比一复刻：服装类型、版型、材质、面料、纹理、颜色、包边和全部设计细节完全一致；模特、姿势、构图和背景差异不算服装不一致。重点检查：1）是否把模特原服装的款式、颜色、图案或细节混入了结果（这是不一致，必须判失败）；2）生成服装的材质、面料、织法、纹理是否与原产品一比一一致。"
      :"这是三种姿势结果。服装类型、颜色、面料材质、纹理、织法、包边配色及全部设计细节也必须和原产品一比一一致，姿势、人物和构图变化不算服装不一致。";
  const imageOrder=workflow==="recolor"?"图片顺序：第1张是上一流程已确认姿势图，第2张是当前颜色款整件服装设计参考，第3张是复色结果图。":"图片顺序：第1张是原产品服装基准图，第2张是生成结果图。只比较核心商品服装，不比较人物姿势、脸、背景、构图和裁切。";
  return `${imageOrder}\n${colorRule}\n已知产品细节：${known||"请完全根据原产品图判断"}。\n逐项检查版型轮廓、领口袖口肩线下摆、长度和比例、面料材质、织法与纹理密度方向、渐变与色块布局、包边、纽扣印花及特殊设计。看不清时必须列入 issues 并判为 needs review，不能猜测。score 为服装设计一致度；严重结构、材质、纹理、错误边色、人物动作或构图任一项错误时 consistent 必须为 false。返回 JSON：{"consistent":boolean,"score":0到100,"summary":"中文结论","issues":["具体差异"],"checks":{"silhouette":boolean,"material":boolean,"texture":boolean,"construction":boolean,"details":boolean,"color":boolean}}`;
}
