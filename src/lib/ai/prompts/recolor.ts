import { PHOTOREAL_QUALITY_PROMPT, QUALITY_SELF_CHECK_PROMPT } from "./image-quality";
import { protectedClothingForArea, type RecolorGarmentArea } from "../../recolor-scope";
import type {RecolorStructureMode} from "../../recolor-structure";
import {isButtonColorPart,isComplexColorPart} from "../color-analysis-normalize";

export const RECOLOR_PROMPT_VERSION = "recolor-v13-simple-colorway-first";
export const RECOLOR_SAME_STYLE_RULE = "同款不同色默认规则：第一张图片中的服装是款式、版型、结构、裁片、比例、面料、纹理、垂感和全部设计布局的唯一基准。默认只允许改变对应服装区域的颜色，口袋、条纹、拼接、扣子、印花、包边、车线、下摆、袖口、门襟、领口的数量、形状、尺寸、位置和边界必须与第一张图逐像素语义对齐。第二张颜色参考图不得替换或重做第一张图的款式，颜色不同绝不等于设计不同。";
export const RECOLOR_EXPLICIT_VARIANT_RULE = "明确颜色款差异规则：视觉分析与人工确认已证明当前颜色款存在真实结构差异；只允许把已列明的差异映射到第一张图的对应服装部位。未列明的版型、结构、口袋、条纹、拼接、包边、扣子、印花、车线、面料、下摆、袖口、门襟和领口仍必须保持第一张图不变。不得把折叠、遮挡、拍摄角度、穿着褶皱或颜色差异误当成款式差异。";
export const RECOLOR_CONSISTENCY_RULE = "同款颜色设计一致性 · 最高规则：同一颜色款的多张输出图必须使用完全相同的款式与颜色分区；扣子数量与位置、口袋、条纹、拼接、包边、印花、车线、面料分区必须逐张一致，绝对不允许多一块少一块，不允许任何一张出现局部错位。";

export function recolorPrompt(
  area:string,
  color:string,
  hex:string,
  protectedAreas:string[],
  extra:string,
  _showFace?:boolean,
  trimColorName="",
  trimHex="",
  variantDesignDetails:string[]=[],
  variantMaterialFeatures="",
  colorNameRule="",
  _recolorMode:"uniform"|"perVariant"="perVariant",
  variantColorRegions:Array<{part:string;colorName:string;hex?:string;confidence:number}>=[],
  isUniformColor=false,
  uniformColorConfidence=0,
  occlusion:"none"|"partial"|"heavy"="none",
  occlusionPolicy:"visible_only"|"extend_uniform"="visible_only",
  occlusionReason="",
  structureMode:RecolorStructureMode="same_style",
  structureDifferences:string[]=[],
  structureDifferenceConfidence=0,
) {
  const lockedArea=area as RecolorGarmentArea;
  const inputModeLabel=_recolorMode==="uniform"?"统一颜色输入":"逐款颜色参考输入";
  const explicitVariant=structureMode==="explicit_variant"&&structureDifferences.length>0&&structureDifferenceConfidence>=0.85;
  const structureRule=explicitVariant?RECOLOR_EXPLICIT_VARIANT_RULE:RECOLOR_SAME_STYLE_RULE;
  const usableRegions=variantColorRegions.filter(region=>!isButtonColorPart(region.part));
  const complexColorway=explicitVariant||usableRegions.some(region=>isComplexColorPart(region.part));
  const mapping=complexColorway&&usableRegions.length
    ?usableRegions.map(region=>`${region.part}=${region.colorName}${region.hex?`(${region.hex})`:""}，置信度${Math.round(region.confidence*100)}%`).join("；")
    :`主体=${color}${hex?`(${hex})`:""}；普通颜色款只映射主体颜色`;
  const occlusionRule=occlusionPolicy==="extend_uniform"&&isUniformColor&&uniformColorConfidence>=0.75
    ?`参考图可见证据以${Math.round(uniformColorConfidence*100)}%置信度确认该颜色款是统一单色。遮挡部分继续使用第一张图的原款布局，并只把可见主体色延展到同一个服装主体区域；不得改变任何结构或虚构异色细节。`
    :occlusion==="none"
      ?"参考图未发现影响配色判断的明显遮挡；仍须按第一张图的原款布局进行颜色映射。"
      :`参考图存在${occlusion==="heavy"?"明显":"部分"}遮挡：${occlusionReason||"部分颜色或结构不可见"}。看不见的结构必须沿用第一张图；只允许映射真实可见且能对应到原款相同部位的颜色。无法确认的颜色必须标记人工审核，禁止猜色、乱分区或把整个区域粗暴改成同色。`;

  return `任务：电商服装“同款不同色”精准复色。
【图片职责不可互换】
第1张图片：上一流程已经确认的姿势/换装结果（三姿势已确认图），是人物、露脸状态、姿势、动作、身体比例、景别、构图、背景、光影、服装款式、版型、结构、面料纹理、垂感以及颜色区域布局的唯一基础底图。
第2张图片：当前颜色款参考图，普通款只负责提供主体颜色；只有明确的复杂多色款才提供包边、条纹、拼接、撞色、印花等对应部位的真实颜色。扣子、纽扣和统一五金颜色始终继承第1张图，不参与颜色款命名或改色。除非下方明确列出高置信度结构差异，否则不得用第2张图重做、替换或改变第1张图的服装设计。

【先锁布局，再映射颜色】
先在第1张图锁定目标服装和非服装边界。${complexColorway?"当前属于复杂颜色款：继续锁定主体、包边、条纹、拼接、印花等原始区域，再把第2张图可见颜色映射回相同位置。":"当前属于普通颜色款：只把第2张图的主体色映射到第1张图原有服装主体，保留原有阴影、纹理和全部设计细节，不启动不必要的局部颜色拆分。"}禁止颜色越界，禁止污染人物、背景或其他服饰。

目标服装区域：${area}
输入组织模式：${inputModeLabel}；无论输入模式如何，都必须执行同款结构锁定和逐部位颜色映射。
参考图辅助名称：${color}
参考图辅助 HEX：${hex||"未指定"}
【证据优先级】第2张图真实可见颜色 > 人工确认的局部配色 > 名称、标题、文件名与 HEX。名称和 HEX 只能辅助命名，冲突时以第2张图可见颜色为准；但第1张图始终负责款式结构和区域布局。
${colorNameRule?`名称辅助解析（不得覆盖图片）：${colorNameRule}`:""}
${structureRule}
结构处理结论：${explicitVariant?`允许的明确差异仅限：${structureDifferences.join("；")}；结构差异置信度 ${Math.round(structureDifferenceConfidence*100)}%。`:"当前颜色款按同款不同色处理，所有结构与第一张图完全一致；没有达到明确证据门槛的疑似差异一律忽略。"}
颜色款可见设计信息（只用于核对同款区域及明确差异，不自动授权改款）：${variantDesignDetails.length?variantDesignDetails.join("；"):"未发现可靠的独立结构差异"}。
颜色款面料观察：${variantMaterialFeatures||"未提供"}。默认继续保持第一张图的面料类别、织法、纹理、光泽、厚薄和垂感，不得因颜色参考图拍摄条件不同而换材质。
颜色处理模式：${complexColorway?"复杂款逐部位映射":"普通款主体色快速映射"}。
当前颜色映射：${mapping}。
遮挡执行规则：${occlusionRule}
${RECOLOR_CONSISTENCY_RULE}

【绝对锁定】
只修改第1张图中“${area}”服装的对应颜色区域。背景、皮肤、头发、鞋子、道具以及脸、手脚、配饰、地面、阴影、高光和其他服饰全部禁止修改。绝对不得改色的其他服饰：${protectedClothingForArea(lockedArea)}。以下区域必须保持不变：${protectedAreas.join("、")}。
${complexColorway?`复杂款边饰颜色：${trimColorName||"按第2张参考图真实可见的对应区域处理"}${trimHex?`（${trimHex}）`:""}。只允许进入原款已有的对应区域，不能扩散。`:"普通款不单独识别或改动边饰、扣子与五金颜色；它们全部继承第1张图。"}
【人物与构图最高优先级】露脸与原图样式锁定：有脸就保留同一张脸、五官、发型和可见程度；没有脸就不得补画、生成或露出脸部。不得改变原图人物、姿势、景别、构图、背景或光影，不得改变动作或整体画面样式；禁止肤色偏差、皮肤污染或人物重绘。
面料与款式锁定：版型、裁片、长度、比例、口袋、条纹、拼接、包边、扣子、印花、车线、下摆、袖口、门襟、领口、面料纹理和垂感必须保持；${explicitVariant?"只执行已列出的明确差异，其余全部锁定。":"任何一项结构变化都属于失败。"}
${extra}
补充要求不得削弱上述同款结构、颜色映射、人物与非服装区域锁定规则。

【禁止裁剪服装 · 最高优先规则】原图中可见的全部服装范围必须完整保留，不得裁掉领口、肩部、袖口、腰头、口袋、下摆、裙摆、裤腿或裤脚。比例不一致时等比例缩放整张画面，只能扩展背景，绝对不能裁切人物或服装，也不能拉伸人物和服装。输出前确认服装所有可见边缘均未被新画面边界裁掉。
【生成前强制自检】1）仍是第1张图的同一款式；2）版型和结构未变；3）主体及局部颜色逐项匹配第2张图；4）颜色没有错位或越界；5）遮挡部分沿用原款布局且没有猜色；6）面料纹理和垂感未变；7）背景、人物、皮肤和其他服饰未改；8）人物动作、景别和构图与第1张一致。任一项不满足必须判定失败，不得输出为合格结果。
禁止多宫格、文字和无关新增元素；不得直接返回未复色的原图。${PHOTOREAL_QUALITY_PROMPT}${QUALITY_SELF_CHECK_PROMPT}`;
}
