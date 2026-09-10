import type { Job, Project } from "@/lib/db";
import type { GenerationWorkflow } from "../types";
import { isComplexColorway, recolorColorName } from "@/lib/color-sets";
import { isButtonColorPart } from "../color-analysis-normalize";

export function garmentConsistencyPrompt(
  workflow: GenerationWorkflow,
  project: Project,
  job: Job,
) {
  const profile = project.profile?.attributes || {};
  const known = [
    profile.fabric,
    profile.fabricTexture,
    profile.weaveStructure,
    profile.gradientDesign,
    profile.colorBlockLayout,
    profile.specialDesign,
    profile.neckline,
    profile.sleeveType,
    profile.trimColor,
  ]
    .filter(Boolean)
    .join("；");
  const color = project.targetColors?.find(
    (item) => item.id === job.targetColorId,
  );
  const structureMode = color?.structureMode || "same_style";
  const explicitDifferences = color?.structureDifferences || [];
  const explicitVariant =
    structureMode === "explicit_variant" &&
    explicitDifferences.length > 0 &&
    (color?.structureDifferenceConfidence ?? 0) >= 0.85;
  const variantDetails = color?.designDetails?.length
    ? color.designDetails.join("、")
    : "未识别到可靠的独立结构差异";
  const variantMaterial = color?.materialFeatures || "未提供颜色参考图面料观察";
  const complexColorway = color ? isComplexColorway(color) : false;
  const usableColorRegions = color?.colorRegions?.filter(
    (region) => !isButtonColorPart(region.part),
  );
  const variantColors = complexColorway && usableColorRegions?.length
    ? usableColorRegions
        .map(
          (region) =>
            `${region.part}=${region.colorName}${region.hex ? `(${region.hex})` : ""}`,
        )
        .join("、")
    : `普通颜色款只检查主体色=${color?.name || job.colorName || "以第2张图为准"}${color?.hex ? `(${color.hex})` : ""}`;
  const occlusionRule =
    color?.occlusion && color.occlusion !== "none"
      ? color.occlusionPolicy === "extend_uniform" && color.isUniformColor
        ? `参考图存在遮挡，但已确认整件为统一单色；检查遮挡区域是否只延续可见主体色，且没有虚构异色细节。`
        : `参考图存在遮挡且不可安全推断；结果不得为不可见区域虚构颜色或设计，否则判为不一致并列入人工审核。`
      : "参考图无遮挡推断问题。";
  const detailLock = project.garmentDetailLock;
  const detailReferences =
    job.detailReferenceImages || detailLock?.detailReferences || [];
  const lockedFields = detailLock
    ? Object.entries(detailLock.fields)
        .filter(([, field]) => field.visibility === "visible")
        .map(([key, field]) => `${key}=${field.value}`)
        .join("；")
    : "未建立结构化细节锁";
  const colorRule =
    workflow === "recolor"
      ? `这是“同款不同色”复色结果。第1张已确认姿势图是人物、姿势、动作、景别、构图、背景、画面样式、服装版型、结构、面料、纹理、垂感、扣子五金和全部颜色区域布局的唯一底图；第2张当前颜色款参考图${complexColorway ? "负责提供主体及明确复杂分区的真实颜色" : "只负责提供普通颜色款的主体色"}；第3张是待检结果。默认规则是只改颜色、不改款式。${explicitVariant ? `当前仅允许这些已经确认且置信度达到门槛的设计差异：${explicitDifferences.join("、")}；除此以外全部结构必须与第1张一致。` : "当前颜色款没有获准改变结构，口袋、条纹、拼接、包边、扣子、印花、车线、下摆、袖口、门襟和领口必须与第1张完全一致。"}名称“${color ? recolorColorName(color) : job.colorName || "未命名"}”和 HEX ${color?.hex || color?.baseHex || "未提供"} 只作辅助，若与第2张图片冲突必须以图片真实可见颜色为准。颜色映射：${variantColors}。${complexColorway ? `复杂款参考观察（不能自动授权改款）：${variantDetails}。参考图面料观察：${variantMaterial}。` : "普通款不要求逐项分析边饰或五金颜色。"}实际面料类别、织法、纹理、厚薄、光泽、垂感以及扣子/五金颜色仍以第1张为准。${occlusionRule}必须同时检查：1）第3张的人物、露脸状态、动作、景别、构图和背景是否与第1张一致；2）第3张是否仍是第1张的同一个款式，版型、结构和各部位位置是否一致；3）主体色是否匹配第2张；${complexColorway ? "复杂款的包边、条纹、拼接、撞色、印花等局部颜色是否准确映射；" : "扣子、五金和其他细节是否保持第1张不变；"}4）颜色是否越界；5）面料纹理、织法、光泽、厚薄、垂感是否与第1张一致；6）背景、皮肤、头发、鞋子、配饰、道具等非目标区域是否完全未改。任何未获准款式变化、颜色错位、非服装区域误改、无依据补全遮挡区、人物动作或构图改变，consistent 必须为 false。`
      : workflow === "tryon"
        ? `这是服装换装候选图。服装类型、版型、材质、面料、纹理、颜色、包边和全部设计细节完全一致是最低要求；必须与产品服装和各局部特写达到逐项视觉等价，不接受相似款、近似款或“大致一致”。模特、姿势、构图和背景差异不算服装不一致；人体贴合导致的必要透视、遮挡和自然褶皱可以变化，但不能借此改变任何商品设计事实。若产品依据中同时出现多件或多个颜色款，结果只能对应其中同一件、同一颜色款，颜色和全部细节必须来自这一件，不能跨款拼接。结构化细节锁：${lockedFields}。重点逐项检查：1）singleSourceGarment：是否只采用同一件、同一颜色款，且没有混入另一件的颜色、图案、面料或细节；2）是否混入参考模特原服装；3）商品类别、商品子类、版型、廓形、长度、覆盖范围、松量、裁片比例、领口、袖型、门襟和下摆；4）扣子数量、相对位置、间距、大小、颜色、形状、排列和门襟方向；5）口袋数量、相对位置、开口、形状与比例；6）条纹数量与位置、包边、车线的数量、方向、间距和位置；7）印花、刺绣、拼接的形状、比例、方向和位置；8）面料材质、织法、纹理方向与密度、厚薄、光泽与垂感；9）左右结构是否一致；10）是否新增产品图不存在的设计；11）是否丢失产品图已有设计；12）是否有错位、畸形、杂质、重复或明显AI异常。任何混款或任一可见细节错误都必须 consistent=false，对应 checks 必须为 false，不能用较高总分抵消；只有所有可见项目均一致时才允许给95分以上。看不清或证据不足时应降低到85至94分并列入 issues 交给人工确认，不能猜测为通过。若错误只局限于扣子、口袋、条纹、包边、车线、印花、刺绣、拼接、领口、袖口、下摆或面料局部，必须在 repairTargets 中给出错误类型、具体修复说明、该错误在最后一张输出图中的归一化 boundingBox（x/y/width/height 均为0到1）和置信度；无法可靠定位则不要伪造 boundingBox。`
        : `这是三种姿势结果。人物身份必须严格锁定：结果必须是人物底图中的同一个真人，姿势改变不等于允许换人。逐项比较脸型、五官比例、眼睛、鼻子、嘴唇、下颌线、耳朵、发际线、发型、发色、肤色、皮肤特征、体型比例及非服装配饰；不得复制姿势参考图中的人物，也不得生成相似但不同的新模特。若不是同一个人，checks.person 必须为 false、consistent 必须为 false。姿势动作允许按模板变化，但服装类型、颜色、面料材质、纹理、织法、包边配色及全部设计细节必须和原产品一比一一致；扣子数量、位置、大小、颜色、形状、排列和门襟方向必须与原产品一致，口袋、条纹、印花、拼接、包边、车线不得改变。`;
  const imageOrder =
    workflow === "recolor"
      ? "图片顺序：第1张是上一流程已确认姿势图和原款结构布局基准，第2张是当前颜色款颜色参考图，第3张是复色结果图。"
      : workflow === "tryon"
        ? `图片顺序：第1张是服装产品主依据；${detailReferences.map((reference, index) => `第${index + 2}张是${reference.label}`).join("；")}${detailReferences.length ? "；" : ""}最后1张是待检换装结果。产品主图决定整体结构，各特写只对对应局部提供更清晰证据。只比较商品服装，不比较人物姿势、脸、背景、构图和裁切。`
        : project.assets?.garmentImage && (job.sourceModelImage || project.confirmedTryonImage || job.inputImages?.[0])
          ? "图片顺序：第1张是原产品服装基准图；第2张是必须保持身份一致的人物底图；第3张是三姿势生成结果。服装对照第1张，人物身份对照第2张；允许姿势变化，绝不允许换人。"
          : "图片顺序：第1张是必须保持人物身份和服装一致的人物底图；第2张是三姿势生成结果。允许姿势变化，绝不允许换人或改变服装。";
  const repairOutput =
    workflow === "tryon"
      ? `,"repairTargets":[{"type":"buttons|pockets|stripes|trim|stitching|print|embroidery|paneling|neckline|sleeve|hem|fabric|other","description":"只描述应修复的局部错误","boundingBox":{"x":0,"y":0,"width":0.1,"height":0.1},"confidence":0到1}]`
      : "";
  return `${imageOrder}\n${colorRule}\n已知产品细节：${known || "请完全根据原产品图判断"}。\n逐项检查版型轮廓、领口袖口肩线下摆、长度和比例、面料材质、织法与纹理密度方向、渐变与色块布局、包边、纽扣印花及特殊设计。看不清时必须列入 issues 并降低分数，不能猜测。score 为服装设计一致度；严重结构、材质、纹理、错误边色、颜色区域错位、非服装区域误改、人物动作或构图任一项错误时 consistent 必须为 false。返回 JSON：{"consistent":boolean,"score":0到100,"summary":"中文结论","issues":["具体差异"],"checks":{"singleSourceGarment":boolean,"silhouette":boolean,"material":boolean,"texture":boolean,"construction":boolean,"details":boolean,"color":boolean,"buttons":boolean,"pockets":boolean,"stripesTrimStitching":boolean,"graphics":boolean,"necklineSleeveHem":boolean,"symmetry":boolean,"extraDesigns":boolean,"missingDesigns":boolean,"colorMapping":boolean,"regionIsolation":boolean,"person":boolean,"composition":boolean,"occlusion":boolean}${repairOutput}}`;
}
