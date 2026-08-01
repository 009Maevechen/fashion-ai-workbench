"use client";

import {useEffect,useRef,useState} from "react";
import {readableColorName} from "@/lib/color-palette";
import {hexToRgb,normalizeHex,rgbToHex,type RgbColor} from "@/lib/color-adjustment";

type Sample={hex:string;name:string;x:number;y:number};

function median(values:number[]){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]||0}

export default function ReferenceColorSampler({src,existingNames,onAdd,onExtractAll,extracting,disabled}:{src:string;existingNames:string[];onAdd:(sample:{name:string;hex:string})=>Promise<void>;onExtractAll:()=>void;extracting?:boolean;disabled?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null),image=useRef<HTMLImageElement|null>(null);
  const [sample,setSample]=useState<Sample|null>(null),[radius,setRadius]=useState(8),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[paletteOpen,setPaletteOpen]=useState(false);
  useEffect(()=>{
    const current=new Image();
    current.onload=()=>{image.current=current;const target=canvas.current;if(!target)return;target.width=current.naturalWidth;target.height=current.naturalHeight;target.getContext("2d",{willReadFrequently:true})?.drawImage(current,0,0)};
    current.onerror=()=>setMessage("颜色参考图无法读取，请重新上传");
    current.src=src;
    return()=>{image.current=null};
  },[src]);
  function pick(event:React.MouseEvent<HTMLCanvasElement>){
    const target=canvas.current,loaded=image.current;if(!target||!loaded)return;
    const rect=target.getBoundingClientRect(),x=Math.max(0,Math.min(target.width-1,Math.round((event.clientX-rect.left)/rect.width*target.width))),y=Math.max(0,Math.min(target.height-1,Math.round((event.clientY-rect.top)/rect.height*target.height)));
    const left=Math.max(0,x-radius),top=Math.max(0,y-radius),width=Math.min(target.width-left,radius*2+1),height=Math.min(target.height-top,radius*2+1),pixels=target.getContext("2d",{willReadFrequently:true})?.getImageData(left,top,width,height).data;
    if(!pixels)return;
    const centerOffset=(Math.floor(height/2)*width+Math.floor(width/2))*4,center=[pixels[centerOffset],pixels[centerOffset+1],pixels[centerOffset+2]],red:number[]=[],green:number[]=[],blue:number[]=[];
    // 只统计与点击中心颜色接近的像素，避免取色范围内的包边、印花、阴影或背景污染结果。
    for(let offset=0;offset<pixels.length;offset+=4)if(pixels[offset+3]>128&&Math.hypot(pixels[offset]-center[0],pixels[offset+1]-center[1],pixels[offset+2]-center[2])<58){red.push(pixels[offset]);green.push(pixels[offset+1]);blue.push(pixels[offset+2])}
    const hex=`#${[median(red),median(green),median(blue)].map(value=>value.toString(16).padStart(2,"0")).join("").toUpperCase()}`;
    setSample({hex,name:readableColorName(hex,existingNames),x:x/target.width*100,y:y/target.height*100});setPaletteOpen(false);setMessage("");
  }
  function updateHex(value:string){
    const normalized=normalizeHex(value);if(!normalized||!sample)return;
    setSample({...sample,hex:normalized,name:readableColorName(normalized,existingNames)});
  }
  function updateRgb(channel:keyof RgbColor,value:string){
    if(!sample)return;const rgb=hexToRgb(sample.hex),next={...rgb,[channel]:Math.max(0,Math.min(255,Number(value)||0))};updateHex(rgbToHex(next));
  }
  async function add(){if(!sample)return;setSaving(true);setMessage("");try{await onAdd({name:sample.name,hex:sample.hex});setMessage(`已添加“${sample.name}”色卡，可以继续点击其他衣服取色。`)}catch(error){setMessage(error instanceof Error?error.message:"添加色卡失败")}finally{setSaving(false)}}
  return <section className="reference-color-sampler">
    <div className="color-sampler-head"><div><h3>局部色块取色器</h3><small>点击每件衣服主体面料的中间位置，避开阴影、包边、印花和高光。</small></div><div className="color-sampler-tools"><label>取色范围<select value={radius} onChange={event=>setRadius(Number(event.target.value))}><option value={3}>精确 7×7</option><option value={8}>标准 17×17</option><option value={15}>均匀 31×31</option></select></label><button type="button" className="primary extract-colors-button" disabled={disabled||extracting} onClick={onExtractAll}>{extracting?"正在提取":"提取服装颜色"}</button></div></div>
    <div className="color-sampler-stage">{/* Canvas读取的是当前服务端持久图片，不保存Base64。 */}<canvas ref={canvas} onClick={pick} aria-label="点击颜色参考图读取色块"/>{sample&&<i className="color-sampler-marker" style={{left:`${sample.x}%`,top:`${sample.y}%`}}/>}</div>
    <div className="color-sampler-result">{sample?<><div className="sampled-color-wrap"><button type="button" className="sampled-color" style={{background:sample.hex}} aria-label="打开色板修改读取颜色" onClick={()=>setPaletteOpen(open=>!open)}/>{paletteOpen&&<div className="color-sampler-palette"><div className="palette-title"><b>色板微调</b><button type="button" onClick={()=>setPaletteOpen(false)}>×</button></div><input className="palette-native-picker" type="color" value={sample.hex} onChange={event=>updateHex(event.target.value)}/><label>HEX<input value={sample.hex} maxLength={7} onChange={event=>{const value=event.target.value;if(/^#[0-9A-Fa-f]{6}$/.test(value))updateHex(value)}}/></label><div className="palette-rgb">{(["r","g","b"] as const).map(channel=><label key={channel}>{channel.toUpperCase()}<input type="number" min={0} max={255} value={Math.round(hexToRgb(sample.hex)[channel])} onChange={event=>updateRgb(channel,event.target.value)}/></label>)}</div><small>拖动色板或输入RGB，读取结果会立即更新。</small></div>}</div><label>颜色名称<input value={sample.name} onChange={event=>setSample(current=>current?{...current,name:event.target.value}:current)}/></label><label>读取HEX<input value={sample.hex} readOnly/></label><button className="primary" type="button" disabled={disabled||saving||!sample.name.trim()} onClick={()=>void add()}>{saving?"正在添加":"添加为新色卡"}</button></>:<span className="color-sampler-empty">点击上方图片中的服装主体颜色开始取色</span>}</div>
    {message&&<div className={message.includes("失败")?"error":"notice"}>{message}</div>}
  </section>;
}
