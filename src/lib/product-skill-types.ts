import type {ProductType} from "./db";

export const PRODUCT_SKILL_WORKFLOWS=["product","tryon","pose","recolor","qc"] as const;
export type ProductSkillWorkflow=(typeof PRODUCT_SKILL_WORKFLOWS)[number];

export type ProductSkill={
  schemaVersion:1;
  id:string;
  name:string;
  description?:string;
  enabled:boolean;
  archived:boolean;
  productTypes:ProductType[];
  workflows:ProductSkillWorkflow[];
  analysisFocus:string[];
  protectedDetails:string[];
  forbiddenChanges:string[];
  riskWarnings:string[];
  consistencyChecklist:string[];
  promptRules:string[];
  source:"manual"|"visual_plan"|"imported";
  createdAt:string;
  updatedAt:string;
};

export type ProductSkillInput=Pick<ProductSkill,
  "name"|"description"|"enabled"|"productTypes"|"workflows"|"analysisFocus"|
  "protectedDetails"|"forbiddenChanges"|"riskWarnings"|"consistencyChecklist"|"promptRules"
>&{source?:ProductSkill["source"]};

export const DEFAULT_ANALYSIS_FOCUS=["商品类型","版型","长度","扣子数量与位置","口袋数量与位置","条纹","包边","拼接","印花","面料纹理","颜色分区"];
export const DEFAULT_PROTECTED_DETAILS=["产品图中真实可见的版型、长度、面料、纹理和垂感","领口、袖口、下摆、门襟、车线等结构","口袋、扣子、条纹、包边、拼接和印花的数量与位置"];
export const DEFAULT_FORBIDDEN_CHANGES=["禁止编造产品图中不可见或不存在的服装细节","禁止混入模特参考图原服装的颜色、版型或结构","禁止改变未被用户明确授权修改的服装区域"];
export const DEFAULT_CONSISTENCY_CHECKLIST=["人物、露脸状态、姿势、景别和构图符合当前步骤要求","服装版型、长度、结构和细节数量与产品图一致","面料纹理、材质感、垂感和颜色分区清晰稳定","背景、皮肤、头发、鞋子和道具未被误改","画面高清、干净、无明显AI伪影、涂抹或杂质"];

export function productSkillReady(skill:Pick<ProductSkill,"name"|"productTypes"|"workflows"|"protectedDetails"|"forbiddenChanges"|"consistencyChecklist">){
  return Boolean(skill.name.trim()&&skill.productTypes.length&&skill.workflows.length&&skill.protectedDetails.length&&skill.forbiddenChanges.length&&skill.consistencyChecklist.length);
}

function strings(value:unknown,limit=80){
  return Array.isArray(value)?[...new Set(value.filter((item):item is string=>typeof item==="string").map(item=>item.trim()).filter(Boolean))].slice(0,limit):[];
}

function productTypeFromVisualPlan(value:unknown):ProductType|undefined{
  const text=typeof value==="string"?value:"";
  if(/裤/.test(text))return "裤装";
  if(/连衣|连身|洋装/.test(text))return "连衣裙";
  if(/半身裙|短裙|长裙/.test(text))return "半身裙";
  if(/套装|两件套|三件套/.test(text))return "套装";
  if(/上衣|衬衫|T恤|针织|毛衣|外套|夹克|背心/.test(text))return "上衣";
}

/** 将独立 fashion-visual-skill 的 VisualPlan 或已导出的产品 Skill 转成可编辑草稿。 */
export function productSkillInputFromJson(value:unknown):ProductSkillInput{
  if(!value||typeof value!=="object")throw new Error("Skill JSON 必须是一个对象");
  const item=value as Record<string,unknown>,garment=item.garmentProfile as Record<string,unknown>|undefined;
  const garmentType=(garment?.garmentType as Record<string,unknown>|undefined)?.value;
  const inferred=productTypeFromVisualPlan(garmentType),rawTypes=strings(item.productTypes,5);
  const productTypes=rawTypes.filter((type):type is ProductType=>["上衣","裤装","连衣裙","半身裙","套装"].includes(type));
  const promptRules=item.promptRules&&typeof item.promptRules==="object"?item.promptRules as Record<string,unknown>:undefined;
  const flattenedPromptRules=promptRules?Object.values(promptRules).flatMap(entry=>strings(entry,80)):[];
  const name=typeof item.name==="string"&&item.name.trim()?item.name.trim():typeof item.sku==="string"&&item.sku.trim()?`${item.sku.trim()} 产品 Skill`:"导入的产品 Skill";
  return {
    name,
    description:typeof item.description==="string"?item.description:"",
    enabled:typeof item.enabled==="boolean"?item.enabled:true,
    productTypes:productTypes.length?productTypes:inferred?[inferred]:[],
    workflows:strings(item.workflows,5).filter((workflow):workflow is ProductSkillWorkflow=>PRODUCT_SKILL_WORKFLOWS.includes(workflow as ProductSkillWorkflow)),
    analysisFocus:strings(item.analysisFocus).length?strings(item.analysisFocus):DEFAULT_ANALYSIS_FOCUS,
    protectedDetails:strings(item.protectedDetails),
    forbiddenChanges:strings(item.forbiddenChanges),
    riskWarnings:strings(item.riskWarnings),
    consistencyChecklist:strings(item.consistencyChecklist),
    promptRules:strings(item.promptRules).length?strings(item.promptRules):flattenedPromptRules,
    source:item.schemaVersion==="1.0"||item.garmentProfile?"visual_plan":"imported",
  };
}
