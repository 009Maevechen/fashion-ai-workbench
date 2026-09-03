export type CorrectionCommandPlan={
  original:string;
  mustChange:string[];
  mustKeep:string[];
  forbiddenChanges:string[];
  referenceSources:string[];
  acceptanceCriteria:string[];
};

export function correctionCommandText(plan:CorrectionCommandPlan){
  const line=(title:string,items:string[])=>`${title}：${items.length?items.join("；"):"无额外要求"}`;
  return [
    "【最高优先级：用户强制命令】",
    `用户原始咒语（不得删改或弱化）：${plan.original}`,
    line("必须修改项",plan.mustChange),
    line("必须保留项",plan.mustKeep),
    line("禁止修改项",plan.forbiddenChanges),
    line("参考来源",plan.referenceSources),
    line("验收条件",plan.acceptanceCriteria),
    "执行优先级：用户强制命令 > 用户人工确认规则 > 产品图真实细节 > 系统自动建议 > 默认Prompt。未指定区域默认保持修正前图片不变。必须修改项未真实命中，或必须保留/禁止修改项被破坏，结果即为失败。",
  ].join("\n");
}

export function correctionPlanFromText(text:string):CorrectionCommandPlan|undefined{
  if(!text.includes("【最高优先级：用户强制命令】"))return undefined;
  const value=(label:string)=>text.match(new RegExp(`${label}：([^\\n]+)`))?.[1]?.trim()||"";
  const items=(label:string)=>{const content=value(label);return !content||content==="无额外要求"?[]:content.split("；").map(item=>item.trim()).filter(Boolean)};
  const original=value("用户原始咒语（不得删改或弱化）");
  if(!original)return undefined;
  return {original,mustChange:items("必须修改项"),mustKeep:items("必须保留项"),forbiddenChanges:items("禁止修改项"),referenceSources:items("参考来源"),acceptanceCriteria:items("验收条件")};
}
