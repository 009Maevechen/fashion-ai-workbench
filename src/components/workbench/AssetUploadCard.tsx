"use client";

import {useEffect,useRef,useState} from "react";

export type LocalAsset={file?:File;url?:string;name?:string;size?:number;width?:number;height?:number;status?:"idle"|"uploading"|"saved"|"failed";error?:string};

export default function AssetUploadCard({label,description,value,onChange,onPreview,onDelete}:{label:string;description?:string;value:LocalAsset;onChange:(asset:LocalAsset)=>void;onPreview:()=>void;onDelete?:()=>void}){
  const [drag,setDrag]=useState(false),input=useRef<HTMLInputElement>(null),objectUrl=useRef<string|undefined>(undefined),selection=useRef(0);
  function revokePreview(){if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current=undefined}}
  useEffect(()=>{if(objectUrl.current&&value.url!==objectUrl.current)revokePreview()},[value.url]);
  useEffect(()=>()=>{selection.current+=1;revokePreview()},[]);
  function accept(file?:File){if(!file)return;selection.current+=1;const token=selection.current;revokePreview();const url=URL.createObjectURL(file);objectUrl.current=url;const image=new Image();image.onload=()=>{if(token!==selection.current)return;onChange({file,url,name:file.name,size:file.size,width:image.width,height:image.height,status:"idle"})};image.onerror=()=>{if(token!==selection.current)return;revokePreview();onChange({file,name:file.name,size:file.size,status:"failed",error:"图片无法预览，请检查文件格式"})};image.src=url}
  return <div><h3 style={{marginBottom:8}}>{label}</h3><div className={`${drag?"upload-card drag":"upload-card"}${value.url?" has-image":""}`} onDragOver={event=>{event.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={event=>{event.preventDefault();setDrag(false);accept(event.dataTransfer.files[0])}} onPaste={event=>accept(event.clipboardData.files[0])} tabIndex={0}>
    {value.url?<><button type="button" className="asset-preview-button" onClick={onPreview} aria-label={`查看${label}大图`}><img src={value.url} alt={label}/><span>查看大图</span></button><div className="upload-meta"><span>{value.name||"已保存图片"}<br/>{value.width?`${value.width}×${value.height} · `:""}{value.size?`${(value.size/1024/1024).toFixed(2)} MB`:"持久化素材"}<br/>{value.status==="uploading"?"正在上传":value.status==="failed"?value.error:"保存成功"}</span><span><button type="button" className="replace" onClick={event=>{event.preventDefault();input.current?.click()}}>更换</button>{onDelete&&<button type="button" className="replace" onClick={event=>{event.preventDefault();onDelete()}}>删除</button>}</span></div></>:<div className="upload-empty"><div><b>＋ 上传{label}</b><span>{description||"点击、拖拽或粘贴图片"}<br/>JPG / PNG / WebP，最大 15MB</span></div></div>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{accept(event.target.files?.[0]);event.currentTarget.value=""}} aria-label={`上传${label}`}/>
  </div></div>;
}
