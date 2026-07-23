import type {TargetColor} from "./db";

export function normalizedColorName(color:Pick<TargetColor,"name">){return color.name.trim()}
export function colorResultCount(color:Pick<TargetColor,"poseResults">){return new Set((color.poseResults||[]).filter(Boolean)).size}
export function isColorSetComplete(color:TargetColor){return Boolean(normalizedColorName(color)&&color.status==="confirmed"&&colorResultCount(color)===3)}
export function duplicateColorNames(colors:TargetColor[]){
  const counts=new Map<string,number>();
  for(const color of colors){const name=normalizedColorName(color).toLocaleLowerCase();if(name)counts.set(name,(counts.get(name)||0)+1)}
  return new Set([...counts].filter(([,count])=>count>1).map(([name])=>name));
}
export function colorSetIssue(color:TargetColor,duplicates=duplicateColorNames([color])){
  const name=normalizedColorName(color);
  if(!name)return "需要命名";
  if(duplicates.has(name.toLocaleLowerCase()))return "名称重复";
  const count=colorResultCount(color);
  if(!color.hex&&!color.baseHex&&!color.cropImage&&count===0)return "需要设置颜色";
  if(count<3)return `复色结果 ${count}/3`;
  if(color.status!=="confirmed")return color.status==="stale"?"需要重新生成":"等待确认";
  return "已完成";
}
