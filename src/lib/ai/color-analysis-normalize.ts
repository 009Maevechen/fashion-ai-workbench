const MATERIAL_LABELS:Record<string,string>={
  texture:"纹理",
  weave:"织法",
  knitting:"织法",
  luster:"光泽",
  lustre:"光泽",
  sheen:"光泽",
  gloss:"光泽",
  thickness:"厚薄",
  weight:"厚薄",
  drape:"垂感",
  handfeel:"手感",
  handFeel:"手感",
  feel:"手感",
};

function readableMaterialValue(value:unknown,depth=0):string{
  if(typeof value==="string")return value.trim();
  if(typeof value==="number"||typeof value==="boolean")return String(value);
  if(!value||depth>=3)return "";
  if(Array.isArray(value))return value.map(item=>readableMaterialValue(item,depth+1)).filter(Boolean).join("、");
  if(typeof value!=="object")return "";
  return Object.entries(value as Record<string,unknown>).map(([key,item])=>{
    const text=readableMaterialValue(item,depth+1);
    if(!text)return "";
    return `${MATERIAL_LABELS[key]||key}：${text}`;
  }).filter(Boolean).join("；");
}

/** 兼容视觉模型把面料特征返回为分项对象或数组，并整理成页面可直接显示的文字。 */
export function normalizeMaterialFeatures(value:unknown):string{
  return readableMaterialValue(value).slice(0,1200);
}

const GENERIC_COLOR_NAMES=/^(颜色\d*|主色|主体色|辅色|点缀色|其他色|同色系|深色|浅色|中性色|未知色|未知|不确定)$/i;
const BROAD_COLOR_NAMES=new Set(["黑色","白色","灰色","棕色","咖啡色","红色","粉色","蓝色","绿色","黄色","紫色","青色","米色","卡其色"]);
export type TrimPart="包边"|"条纹"|"扣子"|"拼接"|"印花"|"撞色"|"线条"|"边"|"";

export function normalizeTrimPart(value:unknown,designDetails:string[]=[]):TrimPart{
  const explicit=typeof value==="string"?value.trim():"";
  const source=[explicit,...designDetails].join(" ");
  if(/包边|滚边|镶边/.test(source))return "包边";
  if(/条纹|条杠/.test(source))return "条纹";
  if(/扣子|纽扣|钮扣/.test(source))return "扣子";
  if(/拼接|拼色/.test(source))return "拼接";
  if(/印花|图案/.test(source))return "印花";
  if(/撞色/.test(source))return "撞色";
  if(/线条|描边|车线/.test(source))return "线条";
  if(/边饰|边缘|边/.test(source))return "边";
  return "";
}

/** 看图名称优先；只有占位名或过于笼统的名称才使用 HEX 校准后的行业色名。 */
export function chooseSpecificColorName(detected:unknown,hexName:string):string{
  const value=typeof detected==="string"?detected.trim().slice(0,30):"";
  if(!value||GENERIC_COLOR_NAMES.test(value)||BROAD_COLOR_NAMES.has(value))return hexName.trim()||value;
  return value;
}

export function generationColorName(mainColor:string,trimColor:string,trimPart:TrimPart):string{
  const main=mainColor.trim(),trim=trimColor.trim();
  if(!trim||!trimPart)return main;
  const colorOnly=trim.replace(/(?:包边|滚边|镶边|条纹|扣子|纽扣|钮扣|拼接|拼色|印花|图案|撞色|线条|描边|车线|边饰|边缘|边)$/u,"").trim();
  if(!colorOnly)return main;
  const normalizedTrim=colorOnly.endsWith("色")?colorOnly:`${colorOnly}色`;
  return `${main}${normalizedTrim}${trimPart}`;
}
