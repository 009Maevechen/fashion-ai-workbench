"use client";

import {useEffect,useMemo,useState} from "react";
import {adjustHex,DEFAULT_COLOR_ADJUSTMENT,hexToRgb,normalizeHex,rgbToHex,type ColorAdjustment,type RgbColor} from "@/lib/color-adjustment";

export default function ColorAdjustmentPanel({baseHex,adjustment,onApply,disabled}:{baseHex?:string;adjustment?:ColorAdjustment;onApply:(value:{baseHex:string;hex:string;colorAdjustment:ColorAdjustment})=>Promise<void>;disabled?:boolean}){
  const initial=normalizeHex(baseHex)||"#C8A06A";
  const propHue=adjustment?.hue||0,propSaturation=adjustment?.saturation||0,propLightness=adjustment?.lightness||0;
  const [base,setBase]=useState(initial),[draft,setDraft]=useState(initial),[adjust,setAdjust]=useState<ColorAdjustment>(adjustment||DEFAULT_COLOR_ADJUSTMENT),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{const next=normalizeHex(baseHex)||"#C8A06A";setBase(next);setDraft(next);setAdjust({hue:propHue,saturation:propSaturation,lightness:propLightness})},[baseHex,propHue,propSaturation,propLightness]);
  const result=useMemo(()=>adjustHex(base,adjust),[base,adjust]),rgb=hexToRgb(result);
  function selectBase(value:string){const next=normalizeHex(value);setDraft(value.toUpperCase());if(next){setBase(next);setDraft(next);setAdjust(DEFAULT_COLOR_ADJUSTMENT);setMessage("")}}
  function setRgb(channel:keyof RgbColor,value:string){const next={...rgb,[channel]:Math.min(255,Math.max(0,Number(value)||0))};const hex=rgbToHex(next);setBase(hex);setDraft(hex);setAdjust(DEFAULT_COLOR_ADJUSTMENT);setMessage("")}
  function setAdjustment(key:keyof ColorAdjustment,value:string){setAdjust(current=>({...current,[key]:Number(value)}));setMessage("")}
  async function apply(){setSaving(true);setMessage("");try{await onApply({baseHex:base,hex:result,colorAdjustment:adjust});setMessage("色差设置已保存，将作为当前颜色的生成目标。")}catch(error){setMessage(error instanceof Error?error.message:"色差设置保存失败")}finally{setSaving(false)}}
  function reset(){setAdjust(DEFAULT_COLOR_ADJUSTMENT);setMessage("")}
  return <section className="color-adjustment-panel">
    <div className="color-adjustment-head"><div><h3>色差微调板</h3><small>先选择基础色，再微调偏色、鲜艳度和明暗</small></div><span className="color-result-chip"><i style={{background:result}}/>{result}</span></div>
    <div className="color-compare"><div><span style={{background:base}}/><small>基础色<br/>{base}</small></div><b>→</b><div><span style={{background:result}}/><small>调整后<br/>{result}</small></div></div>
    <div className="color-board-row"><input className="color-board-picker" type="color" value={base} onChange={event=>selectBase(event.target.value)}/><label>基础色 HEX<input value={draft} maxLength={7} onChange={event=>selectBase(event.target.value)} onBlur={()=>{if(!normalizeHex(draft))setDraft(base)}}/></label></div>
    <div className="rgb-grid">{(["r","g","b"] as const).map(channel=><label key={channel}>{channel.toUpperCase()}<input type="number" min={0} max={255} value={Math.round(rgb[channel])} onChange={event=>setRgb(channel,event.target.value)}/></label>)}</div>
    <div className="color-sliders">
      <label><span>色相偏移 <b>{adjust.hue>0?"+":""}{adjust.hue}°</b></span><input type="range" min={-180} max={180} value={adjust.hue} onChange={event=>setAdjustment("hue",event.target.value)}/></label>
      <label><span>饱和度 <b>{adjust.saturation>0?"+":""}{adjust.saturation}</b></span><input type="range" min={-100} max={100} value={adjust.saturation} onChange={event=>setAdjustment("saturation",event.target.value)}/></label>
      <label><span>明度 <b>{adjust.lightness>0?"+":""}{adjust.lightness}</b></span><input type="range" min={-100} max={100} value={adjust.lightness} onChange={event=>setAdjustment("lightness",event.target.value)}/></label>
    </div>
    <div className="color-adjustment-actions"><button type="button" className="secondary" disabled={saving} onClick={reset}>重置色差</button><button type="button" className="primary" disabled={disabled||saving} onClick={()=>void apply()}>{saving?"正在保存":"应用到当前颜色"}</button></div>
    {message&&<div className={message.includes("失败")?"error":"notice"}>{message}</div>}
  </section>;
}
