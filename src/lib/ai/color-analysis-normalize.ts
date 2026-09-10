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

function stringList(value:unknown):string[]{
  if(Array.isArray(value))return value.flatMap(stringList).map(item=>item.trim()).filter(Boolean);
  if(typeof value!=="string")return [];
  return value.split(/[\n；;、]+/u).map(item=>item.trim()).filter(Boolean);
}

function normalizedHex(value:unknown):string{
  if(typeof value!=="string")return "";
  const compact=value.trim().replace(/^0x/i,"");
  const withHash=compact.startsWith("#")?compact:`#${compact}`;
  if(/^#[0-9A-Fa-f]{3}$/.test(withHash))return `#${[...withHash.slice(1)].map(char=>char.repeat(2)).join("")}`.toUpperCase();
  return /^#[0-9A-Fa-f]{6}$/.test(withHash)?withHash.toUpperCase():"";
}

function normalizedConfidence(value:unknown,fallback=0.5):number{
  const numeric=typeof value==="number"?value:typeof value==="string"?Number(value.replace("%","")):Number.NaN;
  if(!Number.isFinite(numeric))return fallback;
  return Math.max(0,Math.min(1,numeric>1?numeric/100:numeric));
}

function normalizedBox(value:unknown):unknown{
  if(!value||typeof value!=="object")return undefined;
  const box=value as Record<string,unknown>;
  const number=(item:unknown)=>typeof item==="number"?item:typeof item==="string"?Number(item):Number.NaN;
  const x=number(box.x??box.left),y=number(box.y??box.top),width=number(box.width??box.w),height=number(box.height??box.h);
  return [x,y,width,height].every(Number.isFinite)?{x,y,width,height}:undefined;
}

function normalizedBoolean(value:unknown,fallback=false):boolean{
  if(typeof value==="boolean")return value;
  if(typeof value==="string"){
    if(/^(true|yes|是|有|统一|单色)$/i.test(value.trim()))return true;
    if(/^(false|no|否|无|不统一|多色)$/i.test(value.trim()))return false;
  }
  return fallback;
}

function normalizedOcclusion(value:unknown):"none"|"partial"|"heavy"{
  if(value===true)return "partial";
  if(value===false||value==null)return "none";
  const text=String(value).trim().toLowerCase();
  if(["heavy","severe","严重","重度","大面积"].includes(text))return "heavy";
  if(["partial","yes","true","部分","局部","有遮挡","轻度"].includes(text))return "partial";
  return "none";
}

/**
 * 视觉模型常会把数组压成一句话、把 colorName 写成 color，或用 boolean
 * 表示遮挡。先做语义兼容再进入严格 schema，避免可用识别结果整批报废。
 */
export function normalizeColorAnalysisPayload(value:unknown):unknown{
  const root=Array.isArray(value)?{colors:value}:value;
  if(!root||typeof root!=="object")return root;
  const record=root as Record<string,unknown>;
  const rawColors=Array.isArray(record.colors)?record.colors:[];
  return {
    ...record,
    colors:rawColors.map(raw=>{
      if(!raw||typeof raw!=="object")return raw;
      const item=raw as Record<string,unknown>;
      const itemName=String(item.name??item.colorName??item.mainColor??item.primaryColor??"").trim();
      const rawRegions=Array.isArray(item.colorRegions)
        ?item.colorRegions
        :Array.isArray(item.regions)
          ?item.regions
          :[];
      const colorRegions=rawRegions.map(rawRegion=>{
        if(!rawRegion||typeof rawRegion!=="object")return rawRegion;
        const region=rawRegion as Record<string,unknown>;
        const part=String(region.part??region.area??region.region??region.position??"主体").trim()||"主体";
        const hex=normalizedHex(region.hex??region.colorHex??region.value);
        const colorName=String(region.colorName??region.color??region.name??region.label??(part==="主体"?itemName:"")??"").trim()||"待人工确认";
        return {...region,part,colorName,hex,confidence:normalizedConfidence(region.confidence)};
      });
      const firstRegion=colorRegions.find(region=>region&&typeof region==="object"&&"hex" in region&&(region as {hex?:string}).hex) as {hex?:string;colorName?:string}|undefined;
      const resolvedName=itemName||firstRegion?.colorName||"待人工确认";
      const relation=String(item.styleRelation??item.structureRelation??"same").trim().toLowerCase();
      const styleRelation=relation==="explicit_difference"||/不同|差异|variant/.test(relation)
        ?"explicit_difference"
        :relation==="uncertain"||/不确定|无法/.test(relation)
          ?"uncertain"
          :"same";
      return {
        ...item,
        name:resolvedName,
        hex:normalizedHex(item.hex??item.mainHex??item.primaryHex??firstRegion?.hex),
        trimColorName:item.trimColorName??item.secondaryColorName??item.accentColorName??"",
        trimHex:normalizedHex(item.trimHex??item.secondaryHex??item.accentHex),
        trimPart:item.trimPart??item.secondaryPart??item.accentPart??"",
        confidence:normalizedConfidence(item.confidence),
        boundingBox:normalizedBox(item.boundingBox??item.box),
        designDetails:stringList(item.designDetails??item.details),
        materialFeatures:item.materialFeatures??item.material??item.fabricFeatures??"",
        colorRegions,
        isUniformColor:normalizedBoolean(item.isUniformColor??item.uniformColor),
        uniformColorConfidence:normalizedConfidence(item.uniformColorConfidence),
        occlusion:normalizedOcclusion(item.occlusion??item.isOccluded),
        occlusionReason:String(item.occlusionReason??item.occlusionDescription??"").trim(),
        styleRelation,
        structureDifferenceConfidence:normalizedConfidence(item.structureDifferenceConfidence),
        structureDifferences:stringList(item.structureDifferences??item.designDifferences),
      };
    }),
  };
}

const GENERIC_COLOR_NAMES=/^(颜色\d*|主色|主体色|辅色|点缀色|其他色|同色系|深色|浅色|中性色|未知色|未知|不确定)$/i;
const BROAD_COLOR_NAMES=new Set(["黑色","白色","灰色","棕色","咖啡色","红色","粉色","蓝色","绿色","黄色","紫色","青色","米色","卡其色"]);
export type TrimPart="包边"|"条纹"|"扣子"|"拼接"|"印花"|"撞色"|"线条"|"边"|"";

export function isButtonColorPart(value:unknown):boolean{
  return typeof value==="string"&&/扣子|纽扣|钮扣|button/i.test(value);
}

/** 只有真实的多色分区才需要逐部位复色；扣子等统一五金不属于颜色款命名。 */
export function isComplexColorPart(value:unknown):boolean{
  return typeof value==="string"&&/包边|滚边|镶边|条纹|条杠|拼接|拼色|印花|图案|撞色|线条|描边|分区/i.test(value)&&!isButtonColorPart(value);
}

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
  if(trimPart==="扣子")return main;
  if(!trim||!trimPart)return main;
  const colorOnly=trim.replace(/(?:包边|滚边|镶边|条纹|扣子|纽扣|钮扣|拼接|拼色|印花|图案|撞色|线条|描边|车线|边饰|边缘|边)$/u,"").trim();
  if(!colorOnly)return main;
  const normalizedTrim=colorOnly.endsWith("色")?colorOnly:`${colorOnly}色`;
  return `${main}${normalizedTrim}${trimPart}`;
}
