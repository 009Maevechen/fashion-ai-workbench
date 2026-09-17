"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {originalImageUrl,thumbnailUrl} from "@/lib/image-url";
import CopyImageButton from "./CopyImageButton";

export type ImagePreviewDialogProps = {
  images: string[];
  index: number;
  onClose: () => void;
  compact?: boolean;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function ImagePreviewDialog({ images, index, onClose, compact = false, title, actionLabel, onAction }: ImagePreviewDialogProps) {
  const [active,setActive]=useState(index),[zoom,setZoom]=useState(1),[position,setPosition]=useState({x:0,y:0}),[meta,setMeta]=useState({width:0,height:0,bytes:0}),[fullSource,setFullSource]=useState(""),[loadError,setLoadError]=useState(""),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const current=images[active];
  const move=useCallback((delta:number)=>setActive(value=>(value+delta+images.length)%images.length),[images.length]);
  useEffect(()=>{const fn=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();if(event.key==="ArrowLeft")move(-1);if(event.key==="ArrowRight")move(1)};window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn)},[onClose,move]);
  useEffect(()=>{setZoom(1);setPosition({x:0,y:0});setMeta({width:0,height:0,bytes:0});setFullSource("");setLoadError("");if(!current)return;const controller=new AbortController();let objectUrl="";void fetch(originalImageUrl(current),{cache:"no-store",signal:controller.signal}).then(response=>{if(!response.ok)throw new Error("高清原图加载失败");return response.blob()}).then(blob=>{if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setMeta(value=>({...value,bytes:blob.size}));setFullSource(objectUrl)}).catch(error=>{if(!controller.signal.aborted)setLoadError(error instanceof Error?error.message:"高清原图加载失败")});return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}},[current]);
  function pointerDown(event:React.PointerEvent){drag.current={x:event.clientX,y:event.clientY,left:position.x,top:position.y};event.currentTarget.setPointerCapture(event.pointerId)}
  function pointerMove(event:React.PointerEvent){if(!drag.current)return;setPosition({x:drag.current.left+event.clientX-drag.current.x,y:drag.current.top+event.clientY-drag.current.y})}
  function pointerUp(){drag.current=null}
  if (!images[active]) return null;
  return <div className="dialog-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={title || "图片完整预览"}>
    <div className={`image-dialog${compact ? " history-image-dialog" : ""}`} data-photo-copy-ignore onClick={(e)=>e.stopPropagation()}>
      <button className="dialog-close" onClick={onClose} aria-label="关闭图片预览">×</button>
      <div className="image-dialog-stage" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        {fullSource?<img src={fullSource} alt="大图预览" draggable={false} onLoad={event=>{const width=event.currentTarget.naturalWidth,height=event.currentTarget.naturalHeight;setMeta(value=>({...value,width,height}))}} style={{transform:`translate(${position.x}px,${position.y}px) scale(${zoom})`}}/>:<div className="image-dialog-loading">{loadError||"正在加载高清原图…"}</div>}
      </div>
      <div className="image-meta">{title && <strong>{title} · </strong>}{meta.width>0?`${meta.width} × ${meta.height}px`:"读取原始尺寸中"} · {meta.bytes>0?`${(meta.bytes/1024/1024).toFixed(2)} MB`:"读取文件大小中"} · {active+1}/{images.length}</div>
      {images.length>1&&<div className="dialog-thumbnails">{images.map((url,itemIndex)=><button key={`${url}-${itemIndex}`} className={itemIndex===active?"active":""} onClick={()=>setActive(itemIndex)}><img loading="lazy" decoding="async" src={thumbnailUrl(url,240)} alt={`缩略图 ${itemIndex+1}`}/></button>)}</div>}
      <div className="dialog-tools"><button onClick={()=>setZoom(value=>Math.max(.5,value-.25))}>− 缩小</button><button onClick={()=>{setZoom(1);setPosition({x:0,y:0})}}>适应窗口</button><button onClick={()=>setZoom(value=>Math.min(4,value+.25))}>＋ 放大</button>{images.length>1&&<><button onClick={()=>move(-1)}>上一张</button><button onClick={()=>move(1)}>下一张</button></>}<a href={current} download>下载</a><CopyImageButton url={current}/>{actionLabel&&onAction&&<button className="dialog-primary-action" onClick={()=>{onAction();onClose()}}>{actionLabel}</button>}</div>
    </div>
  </div>;
}
