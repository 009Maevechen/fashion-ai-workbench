import {
  PHOTOREAL_QUALITY_PROMPT,
  QUALITY_SELF_CHECK_PROMPT,
} from "./image-quality";
import {
  protectedClothingForArea,
  type RecolorGarmentArea,
} from "../../recolor-scope";
import type { RecolorStructureMode } from "../../recolor-structure";
import {
  isButtonColorPart,
  isComplexColorPart,
} from "../color-analysis-normalize";
import type { ProductType } from "../../db";

export const RECOLOR_PROMPT_VERSION = "recolor-v23-reference-color-gate";
export const RECOLOR_SAME_STYLE_RULE =
  "同款不同色默认规则：第一张图片中的服装是款式、版型、结构、裁片、比例、面料、纹理、垂感和全部设计布局的唯一基准。默认只允许改变对应服装区域的颜色，口袋、条纹、拼接、扣子、印花、包边、车线、下摆、袖口、门襟、领口的数量、形状、尺寸、位置和边界必须与第一张图逐像素语义对齐。第二张颜色参考图不得替换或重做第一张图的款式，颜色不同绝不等于设计不同。";
export const RECOLOR_EXPLICIT_VARIANT_RULE =
  "明确颜色款差异规则：视觉分析与人工确认已证明当前颜色款存在真实结构差异；只允许把已列明的差异映射到第一张图的对应服装部位。未列明的版型、结构、口袋、条纹、拼接、包边、扣子、印花、车线、面料、下摆、袖口、门襟和领口仍必须保持第一张图不变。不得把折叠、遮挡、拍摄角度、穿着褶皱或颜色差异误当成款式差异。";
export const RECOLOR_CONSISTENCY_RULE =
  "同款颜色设计一致性 · 最高规则：同一颜色款的多张输出图必须使用完全相同的款式与颜色分区；扣子数量与位置、口袋、条纹、拼接、包边、印花、车线、面料分区必须逐张一致，绝对不允许多一块少一块，不允许任何一张出现局部错位。";

export const RECOLOR_MICRO_DETAIL_LOCK =
  "【微细节与五金锁定】拉链类型、齿链、拉头形状与位置；扣子/按扣的数量、大小、材质、间距与位置；金属件的金色/银色/枪色表面；品牌标、洗标、刺绣、印字的内容、尺寸与位置；铆钉、搭扣、钩扣、腰袢、抽绳、绳头、褶裥、抽褶、贴布、门襟、明线和装饰车线都必须直接继承第1张底图。除当前颜色参考明确授权的原有布料色区外，这些细节一律不得改色、简化、增删、移动或重画。";

function garmentTypeDetailLock(productType?: ProductType) {
  switch (productType) {
    case "裤装":
      return "【裤装结构锁】必须保持两条独立裤腿、裆缝、内外侧缝、腰头、门襟、腰袢、褶线、口袋、裤脚和原裤长；阔腿/直筒/紧身/喇叭廓形及松量完全不变，绝不能变成裙装。";
    case "半身裙":
      return "【半身裙结构锁】必须保持无裤腿分离的原裙片结构、腰头、褶裥、开衩、层次、荷叶边、口袋、闭合方式、裙摆形状和原裙长；A字/铅笔/百褶/裹身等廓形完全不变，绝不能变成裤装。";
    case "连衣裙":
      return "【连衣裙结构锁】必须保持上下身一体关系、腰线、领口、袖型、门襟、胸省/腰省、裙摆、开衩、长度和原有松量；不得拆成上衣与半身裙，也不得改变覆盖范围。";
    case "套装":
      return "【套装结构锁】必须保持每一件单品的类别、层叠顺序、遮挡关系、边界、长度与相对比例；只给指定服装和指定色区复色，绝不能把上下装合并、互换颜色或污染未指定单品。";
    case "上衣":
      return "【上衣结构锁】必须保持肩线、领口、领座/翻领、袖窿、袖型、袖长、袖口、门襟、胸省、下摆、衣长和原有松量；领型的高度、宽度、翻折、硬挺度、领尖、驳头宽度与缺口位置不得有任何变化。";
    default:
      return "【品类结构锁】服装类别、覆盖范围、开合方式和全部裁片关系必须与第1张底图一致，不得跨品类重做。";
  }
}

export function recolorPrompt(
  area: string,
  color: string,
  hex: string,
  protectedAreas: string[],
  extra: string,
  _showFace?: boolean,
  trimColorName = "",
  trimHex = "",
  variantDesignDetails: string[] = [],
  variantMaterialFeatures = "",
  colorNameRule = "",
  _recolorMode: "uniform" | "perVariant" = "perVariant",
  variantColorRegions: Array<{
    part: string;
    colorName: string;
    hex?: string;
    confidence: number;
  }> = [],
  isUniformColor = false,
  uniformColorConfidence = 0,
  occlusion: "none" | "partial" | "heavy" = "none",
  occlusionPolicy: "visible_only" | "extend_uniform" = "visible_only",
  occlusionReason = "",
  _structureMode: RecolorStructureMode = "same_style",
  structureDifferences: string[] = [],
  structureDifferenceConfidence = 0,
  colorMap: Record<string, string> = {},
  referenceMode: "independent" | "shared" | "selected" = "shared",
  mainColorAuthority: "selected" | "reference" = "reference",
  productType?: ProductType,
) {
  // 保留参数兼容现有调用，但所有结构变更请求都被当前复色规则强制拒绝。
  void _structureMode;
  const lockedArea = area as RecolorGarmentArea;
  const inputModeLabel =
    _recolorMode === "uniform" ? "统一颜色输入" : "逐款颜色参考输入";
  // 当前复色路径强制只改颜色。任何参考图都不得获得改款权限。
  const explicitVariant = false;
  const structureRule = RECOLOR_SAME_STYLE_RULE;
  const usableRegions = variantColorRegions.filter(
    (region) => !isButtonColorPart(region.part),
  );
  const complexColorway =
    explicitVariant ||
    usableRegions.some((region) => isComplexColorPart(region.part)) ||
    Object.keys(colorMap).some(
      (part) => part !== "mainBody" && part !== "buttons",
    );
  const mapping =
    complexColorway && usableRegions.length
      ? usableRegions
          .map(
            (region) =>
              `${region.part}=${region.colorName}${region.hex ? `(${region.hex})` : ""}，置信度${Math.round(region.confidence * 100)}%`,
          )
          .join("；")
      : `主体=${color}${hex ? `(${hex})` : ""}；普通颜色款只映射主体颜色`;
  const colorMapText = Object.keys(colorMap).length
    ? `已识别部位颜色映射（逐项执行，不得越界）：${Object.entries(colorMap)
        .map(([part, value]) => `${part}=${value}`)
        .join("；")}。`
    : "";
  const occlusionRule =
    occlusionPolicy === "extend_uniform" &&
    isUniformColor &&
    uniformColorConfidence >= 0.75
      ? `参考图可见证据以${Math.round(uniformColorConfidence * 100)}%置信度确认该颜色款是统一单色。遮挡部分继续使用第一张图的原款布局，并只把可见主体色延展到同一个服装主体区域；不得改变任何结构或虚构异色细节。`
      : occlusion === "none"
        ? "参考图未发现影响配色判断的明显遮挡；仍须按第一张图的原款布局进行颜色映射。"
        : `参考图存在${occlusion === "heavy" ? "明显" : "部分"}遮挡：${occlusionReason || "部分颜色或结构不可见"}。看不见的结构必须沿用第一张图；只允许映射真实可见且能对应到原款相同部位的颜色。无法确认的颜色必须标记人工审核，禁止猜色、乱分区或把整个区域粗暴改成同色。`;
  const referenceAuthority =
    referenceMode === "independent"
      ? "【新独立参考图 = 唯一颜色标准】当前只传入一张生效中的新独立参考图（第2张）。它是本次主体色、条纹色、包边色、拼接色和其他局部配色的唯一依据。历史独立图、旧共享图、产品页多色拼图、旧结果、颜色标题和旧色卡逻辑必须全部忽略，不得借用、平均、融合或回退。该图只拥有颜色与局部配色决定权，绝无改款权限。"
      : referenceMode === "selected"
        ? "【简单款普通复色】当前没有独立颜色参考图，也没有共享裁图；仅允许对已确认的简单单色款按用户选定基本色进行普通复色。不得拆分局部配色，不得猜测条纹、包边、拼接或印花颜色；一旦款式存在复杂配色就必须停止并要求上传独立参考图。"
        : "【未上传独立参考图 · 使用共享参考】继续以第1张已确认底图锁定同一个设计款式；第2张是从共享颜色参考图中取得的当前色款依据。普通款读取主体色，复杂款可读取其真实可见的条纹、包边、拼接、印花等局部配色并映射到第1张的对应区域，但不得改变服装结构、面料、纹理或设计细节。";
  const selectedMainColor = mainColorAuthority === "selected";
  const mainColorRule = selectedMainColor
    ? `【人工基本色锁定 · 主体色最高优先】用户已经在色卡中选定基本色“${color}”${hex ? `（${hex}）` : ""}，它是服装主体区域的唯一生成目标，优先级高于参考照片的像素取色、曝光、白平衡、阴影、高光和相机色差。参考照片不得把主体色改名、改 HEX 或改成照片采样出的近似色；它只负责证明条纹、包边、拼接、印花等明确局部色区使用什么颜色。生成时必须把服装主体稳定还原为选定基本色，同时保留自然明暗、针织纹理和真实光照，不能把阴影当成另一种颜色。`
    : referenceMode === "selected"
      ? `【简单款基本色依据】主体色只按用户选定的“${color}”${hex ? `（${hex}）` : ""}执行，不得猜测额外局部色。`
      : "【照片主体色依据】主体色必须根据当前唯一生效参考图在校正白平衡、曝光、阴影和高光后判断；不得直接照抄受色差影响的单个像素，也不得参考任何历史图。";
  const perspectiveRule =
    "【参考图姿态归一】颜色参考图即使斜拍、悬挂、折叠、局部遮挡或透视变形，也只用于提取可见的颜色关系。必须在理解上将其对齐到第1张原款的正向服装布局：主体、领口、袖口、下摆、条纹和拼接分别映射到第1张已有的同名区域；禁止复制参考图的角度、褶皱、裁切、轮廓或摆放方式，禁止把斜拍造成的位置偏移当成新设计。";

  return `任务：电商服装“同款不同色”精准复色。
【只允许局部改颜色 · 最高规则】这是基于第1张确认底图的颜色编辑，不是重新设计、重新换装或整图重绘。只修改当前服装对应色区的色相与必要明暗，所有色区边界、款式结构、针织纹理、线迹、褶皱、人物像素和背景像素必须保留。单独上传的当前色款图片拥有局部颜色证据最高优先级，但绝无权限改变服装设计。若无法在不改设计、不降清晰度的前提下完成，必须判定失败，不能输出模糊近似图。
【图片职责不可互换】
第1张图片：上一流程已经确认的姿势/换装结果（三姿势已确认图），是人物、露脸状态、姿势、动作、身体比例、景别、构图、背景、光影、服装款式、版型、结构、面料纹理、垂感以及颜色区域布局的唯一基础底图。
${referenceMode === "selected" ? "当前没有第2张颜色参考图：只允许按用户基本色处理简单单色款。" : "第2张图片：当前唯一生效的颜色参考图。普通款只负责提供主体颜色；复杂款提供主体、包边、条纹、拼接、撞色、印花等真实可见的局部配色关系。没有第3张补充图，任何历史图都不参与。"}扣子、纽扣和统一五金颜色始终继承第1张图，不参与颜色款命名或改色。参考图不得重做、替换或改变第1张图的任何服装设计。
${referenceAuthority}
${mainColorRule}
${perspectiveRule}

【先锁布局，再映射颜色】
先在第1张图锁定目标服装和非服装边界。${complexColorway ? "当前属于复杂颜色款：继续锁定主体、包边、条纹、拼接、印花等原始区域，再把当前唯一新参考图可见颜色映射回相同位置；只改颜色，不改这些区域的形状、数量或位置。" : referenceMode === "selected" ? "当前属于无参考图的简单颜色款：只把用户基本色映射到第1张图原有服装主体，禁止新增局部配色。" : "当前属于普通颜色款：只把当前唯一参考图的主体色映射到第1张图原有服装主体，保留原有阴影、纹理和全部设计细节，不启动不必要的局部颜色拆分。"}禁止颜色越界，禁止污染人物、背景或其他服饰。

【结构锁定 vs 颜色映射 · 严格拆分，绝不串用】
结构（只能来自第1张三姿势底图，逐像素锁定，绝不被参考图改变）：条纹的道数、位置、宽度、间距、顺序；领口/袖口/下摆罗纹的位置、宽度、圈数；版型、裁片、比例、面料纹理与垂感。
颜色（主体与局部分权）：${selectedMainColor ? `主体身片只能使用人工选定的“${color}”${hex ? `（${hex}）` : ""}；` : "主体身片颜色来自参考图校色后的固有色；"}领口罗纹、袖口罗纹、下摆罗纹、每一道条纹、拼接区和印花等局部区域，仅在参考图明确显示不同颜色时按对应位置映射。
严禁：沿用三姿势底图的原主体颜色；${selectedMainColor ? "用参考照片的色差或采样 HEX 覆盖人工基本色；" : referenceMode === "selected" ? "在没有图片依据时猜测复杂局部配色；" : "用标题、文件名、历史参考图或历史结果代替当前唯一新参考图；"}用 SKU 级多色图或其他颜色款的图覆盖当前色款。条纹的结构锁死、颜色按当前款映射，二者不能混为一谈。

目标服装区域：${area}
输入组织模式：${inputModeLabel}；无论输入模式如何，都必须执行同款结构锁定和逐部位颜色映射。
${selectedMainColor ? "用户选定基本色" : "参考图辅助名称"}：${color}
${selectedMainColor ? "用户选定基本色 HEX" : "参考图辅助 HEX"}：${hex || "未指定"}
【颜色来源分权 · 最高优先】${selectedMainColor || referenceMode === "selected" ? "主体色只服从用户选定基本色。" : "主体色根据当前唯一新参考图校正拍摄色差后判断；名称和 HEX 只能辅助命名，冲突时以当前新参考图可见固有色为准。"}${referenceMode === "selected" ? "没有独立参考图时禁止生成复杂辅色布局。" : "辅色、包边、条纹、拼接、印花等局部颜色只以当前唯一新参考图真实可见的颜色关系为准，并逐区域对齐到第1张原款布局。"}第1张图始终负责款式结构和区域布局，并锁定所有区域边界。
${colorNameRule ? `名称辅助解析（不得覆盖图片）：${colorNameRule}` : ""}
${structureRule}
${garmentTypeDetailLock(productType)}
${RECOLOR_MICRO_DETAIL_LOCK}
结构处理结论：${explicitVariant ? `允许的明确差异仅限：${structureDifferences.join("；")}；结构差异置信度 ${Math.round(structureDifferenceConfidence * 100)}%。` : "当前颜色款按同款不同色处理，所有结构与第一张图完全一致；没有达到明确证据门槛的疑似差异一律忽略。"}
颜色款可见设计信息（只用于核对同款区域及明确差异，不自动授权改款）：${variantDesignDetails.length ? variantDesignDetails.join("；") : "未发现可靠的独立结构差异"}。
颜色款面料观察：${variantMaterialFeatures || "未提供"}。默认继续保持第一张图的面料类别、织法、纹理、光泽、厚薄和垂感，不得因颜色参考图拍摄条件不同而换材质。
颜色处理模式：${complexColorway ? "复杂款逐部位映射" : "普通款主体色快速映射"}。
当前颜色映射：${mapping}。
${colorMapText}遮挡执行规则：${occlusionRule}
${RECOLOR_CONSISTENCY_RULE}

【绝对锁定】
只修改第1张图中“${area}”服装的对应颜色区域。背景、皮肤、头发、鞋子、道具以及脸、手脚、配饰、地面、阴影、高光和其他服饰全部禁止修改。绝对不得改色的其他服饰：${protectedClothingForArea(lockedArea)}。以下区域必须保持不变：${protectedAreas.join("、")}。
${complexColorway ? `复杂款边饰颜色：${trimColorName || "按第2张参考图真实可见的对应区域处理"}${trimHex ? `（${trimHex}）` : ""}。只允许进入原款已有的对应区域，不能扩散。` : "普通款不单独识别或改动边饰、扣子与五金颜色；它们全部继承第1张图。"}
【人物与构图最高优先级】露脸与原图样式锁定：有脸就保留同一张脸、五官、发型和可见程度；没有脸就不得补画、生成或露出脸部。不得改变原图人物、姿势、景别、构图、背景或光影，不得改变动作或整体画面样式；禁止肤色偏差、皮肤污染或人物重绘。
面料与款式锁定：版型、裁片、长度、比例、口袋、条纹、拼接、包边、扣子、印花、车线、下摆、袖口、门襟、领口、面料纹理和垂感必须保持；${explicitVariant ? "只执行已列出的明确差异，其余全部锁定。" : "任何一项结构变化都属于失败。"}
${extra}
补充要求不得削弱上述同款结构、颜色映射、人物与非服装区域锁定规则。

【画质不降级 · 最高优先】第1张已确认底图是永久画质基线。复色只改颜色，输出图片的分辨率、锐度、清晰度、噪点水平、真实皮肤毛孔与光泽、服装面料纹理与车线细节都不得低于第1张底图；禁止因改色造成模糊、低清、噪点、涂抹感、塑料感、发灰、发暗、褪色或细节丢失。若改色后画质比底图差，必须判定失败并重试，不得用低清结果冒充成功。

【画面洁净与色调锁定 · 复色硬规则】不得在服装或整张画面叠加灰雾、灰色薄膜、低对比滤镜、脏色、煤灰感、霉斑感、尘点、污渍、随机颗粒、斑驳噪声、脏旧做旧效果或不属于第1张底图的杂乱纹理。复色只能改变原有色区的固有色，不能借“面料质感”之名重新制造绒毛、麻点、黑灰杂点或不均匀脏斑；针织纹理、纱线走向和自然明暗必须直接继承第1张底图，并保持清楚、干净、连续。整张图的曝光、白平衡、对比度、黑位、肤色、背景明暗和光线方向必须与第1张一致，禁止全图调色、压暗、去饱和或蒙灰。即使目标色本身是灰色，也必须呈现干净、明确、有层次的目标灰色，不得出现灰雾、脏斑或材质糊化。任何灰雾污染、异常脏感、非原图斑驳、全局色调变化或材质重绘都属于失败，必须重试或进入人工审核。

【禁止裁剪服装 · 最高优先规则】原图中可见的全部服装范围必须完整保留，不得裁掉领口、肩部、袖口、腰头、口袋、下摆、裙摆、裤腿或裤脚。比例不一致时等比例缩放整张画面，只能扩展背景，绝对不能裁切人物或服装，也不能拉伸人物和服装。输出前确认服装所有可见边缘均未被新画面边界裁掉。
【生成前强制自检】1）仍是第1张图的同一款式；2）版型和结构未变；3）${referenceMode === "selected" ? "主体色匹配用户基本色且没有猜测局部色" : "主体及局部颜色逐项只匹配当前唯一新参考图"}；4）颜色没有错位或越界；5）遮挡部分沿用原款布局且没有猜色；6）面料纹理和垂感未变；7）背景、人物、皮肤和其他服饰未改；8）人物动作、景别和构图与第1张一致；9）服装和画面没有灰雾、脏斑、杂点、异常颗粒或材质糊化；10）曝光、白平衡、对比度和背景光影没有发生全局变化。任一项不满足必须判定失败，不得输出为合格结果。
禁止多宫格、文字和无关新增元素；不得直接返回未复色的原图。${PHOTOREAL_QUALITY_PROMPT}${QUALITY_SELF_CHECK_PROMPT}`;
}
