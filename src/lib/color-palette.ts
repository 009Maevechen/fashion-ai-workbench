export type PaletteColor={name:string;hex:string;pixelRatio:number};

type Lab=[number,number,number];

// 服装行业常用的细分颜色名。使用 Lab 感知色差匹配，避免把相近的棕色都笼统命名为“卡其色”。
const FASHION_COLORS=[
  ["纯黑色","#101010"],["炭黑色","#292827"],["深灰色","#4B4D50"],["中灰色","#77797C"],["浅灰色","#BFC0BF"],["雾灰色","#DDDDDA"],
  ["冷白色","#F4F6F5"],["象牙白","#F3F0E7"],["奶油白","#F4E9D3"],["米白色","#E8DFCE"],["燕麦色","#D5C3A5"],
  ["浅杏色","#E5CBAA"],["杏仁色","#D4B895"],["浅卡其色","#C5AD87"],["黄褐卡其色","#A68D68"],["深卡其色","#867354"],
  ["浅驼色","#BD9674"],["焦糖棕","#A66D45"],["驼棕色","#9A704F"],["栗棕色","#774B38"],["巧克力棕","#58382D"],["深咖啡色","#432E28"],
  ["酒红色","#722B3A"],["砖红色","#A64B3C"],["正红色","#C93538"],["珊瑚粉","#E6817D"],["裸粉色","#D7A0A0"],["藕粉色","#C68F9B"],
  ["雾紫色","#927F9D"],["葡萄紫","#6E4C78"],["薰衣草紫","#A795C8"],["藏青色","#202B45"],["牛仔蓝","#55728E"],["雾霾蓝","#7895A7"],["天蓝色","#6FA7CB"],
  ["墨绿色","#29483A"],["橄榄绿","#65704A"],["鼠尾草绿","#82927B"],["草绿色","#4F8052"],["姜黄色","#C79332"],["柠檬黄","#DFC94C"],["橘棕色","#C76E32"],
] as const;

const clamp=(value:number)=>Math.max(0,Math.min(255,value));
const rgbToHex=(r:number,g:number,b:number)=>`#${[r,g,b].map(value=>clamp(Math.round(value)).toString(16).padStart(2,"0")).join("").toUpperCase()}`;
const hexToRgb=(hex:string)=>[1,3,5].map(index=>Number.parseInt(hex.slice(index,index+2),16));
const linear=(value:number)=>{const normalized=value/255;return normalized<=.04045?normalized/12.92:((normalized+.055)/1.055)**2.4};
const rgbToLab=(rgb:number[]):Lab=>{
  const [r,g,b]=rgb.map(linear),x=(r*.4124564+g*.3575761+b*.1804375)/.95047,y=(r*.2126729+g*.7151522+b*.072175),z=(r*.0193339+g*.119192+b*.9503041)/1.08883;
  const transform=(value:number)=>value>.008856?Math.cbrt(value):7.787*value+16/116;
  const fx=transform(x),fy=transform(y),fz=transform(z);
  return [116*fy-16,500*(fx-fy),200*(fy-fz)];
};
const labDistance=(left:Lab,right:Lab)=>Math.sqrt(left.reduce((sum,value,index)=>sum+(value-right[index])**2,0));
const fashionLabs=FASHION_COLORS.map(([name,hex])=>({name,lab:rgbToLab(hexToRgb(hex))}));

function uniqueName(base:string,used:Set<string>){
  if(!used.has(base)){used.add(base);return base}
  let index=2;
  while(used.has(`${base}（${index}）`))index+=1;
  const name=`${base}（${index}）`;used.add(name);return name;
}

function colorName(rgb:number[],used:Set<string>){
  const lab=rgbToLab(rgb);
  const nearest=[...fashionLabs].sort((a,b)=>labDistance(lab,a.lab)-labDistance(lab,b.lab))[0].name;
  return uniqueName(nearest,used);
}

export function readableColorName(hex:string,usedNames:string[]=[]){
  const used=new Set(usedNames.map(name=>name.trim()).filter(Boolean));
  return colorName(hexToRgb(hex),used);
}

/** CIE Lab 感知色差；大约小于 7 时肉眼通常会认为是同一款颜色。 */
export function colorDistance(left:string,right:string){return labDistance(rgbToLab(hexToRgb(left)),rgbToLab(hexToRgb(right)))}

export function extractColorPalette(data:Uint8Array,channels:number,limit=5):PaletteColor[]{
  if(channels<3||data.length<channels)return [];
  const buckets=new Map<string,{r:number;g:number;b:number;count:number}>();
  let pixels=0;
  for(let offset=0;offset+2<data.length;offset+=channels){
    if(channels===4&&data[offset+3]<96)continue;
    const r=data[offset],g=data[offset+1],b=data[offset+2],key=`${r>>4}-${g>>4}-${b>>4}`;
    const bucket=buckets.get(key)||{r:0,g:0,b:0,count:0};
    bucket.r+=r;bucket.g+=g;bucket.b+=b;bucket.count+=1;buckets.set(key,bucket);pixels+=1;
  }
  const candidates=[...buckets.values()]
    .filter(bucket=>bucket.count/Math.max(1,pixels)>.003)
    .sort((a,b)=>b.count-a.count)
    .map(bucket=>({rgb:[bucket.r/bucket.count,bucket.g/bucket.count,bucket.b/bucket.count],count:bucket.count}));
  const merged:typeof candidates=[];
  for(const candidate of candidates){
    const candidateLab=rgbToLab(candidate.rgb),match=merged.find(item=>labDistance(rgbToLab(item.rgb),candidateLab)<9);
    if(match){
      const total=match.count+candidate.count;
      match.rgb=match.rgb.map((value,index)=>(value*match.count+candidate.rgb[index]*candidate.count)/total);
      match.count=total;
    }else merged.push({...candidate,rgb:[...candidate.rgb]});
  }
  const distinct=merged.sort((a,b)=>b.count-a.count).filter((candidate,index,list)=>list.slice(0,index).every(item=>labDistance(rgbToLab(item.rgb),rgbToLab(candidate.rgb))>11));
  // 模特参考拼图里常包含脸、手臂等肤色；只排除明显的粉橙肤色区间，米色/卡其色仍会保留。
  const garmentCandidates=distinct.filter(item=>{const [lightness,a,b]=rgbToLab(item.rgb);return !(lightness>55&&lightness<86&&a>12&&a<30&&b>7&&b<29)});
  // 中灰背景、墙面和牛仔裤通常是低彩度中间调；服装色卡只保留彩色主色，加最亮/最暗两个中性色。
  const chromatic=garmentCandidates.filter(item=>{const [,a,b]=rgbToLab(item.rgb);return Math.hypot(a,b)>=8});
  const neutral=garmentCandidates.filter(item=>{const [,a,b]=rgbToLab(item.rgb);return Math.hypot(a,b)<8});
  const picked=[...chromatic.slice(0,Math.max(1,limit-2))];
  const darkest=[...neutral].sort((a,b)=>rgbToLab(a.rgb)[0]-rgbToLab(b.rgb)[0])[0];
  const lightest=[...neutral].sort((a,b)=>rgbToLab(b.rgb)[0]-rgbToLab(a.rgb)[0])[0];
  for(const item of [darkest,lightest])if(item&&picked.every(current=>labDistance(rgbToLab(current.rgb),rgbToLab(item.rgb))>11))picked.push(item);
  for(const item of garmentCandidates)if(picked.length<limit&&picked.every(current=>labDistance(rgbToLab(current.rgb),rgbToLab(item.rgb))>11))picked.push(item);
  const used=new Set<string>();
  return picked.slice(0,limit).map(item=>({name:colorName(item.rgb,used),hex:rgbToHex(...item.rgb as [number,number,number]),pixelRatio:Number((item.count/Math.max(1,pixels)).toFixed(4))}));
}
