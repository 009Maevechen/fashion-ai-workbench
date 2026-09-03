"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {thumbnailUrl} from "@/lib/image-url";
import CopyImageButton from "./CopyImageButton";

export default function ImagePreviewDialog({ images, index, onClose }: { images: string[]; index: number; onClose: () => void }) {
  const [active,setActive]=useState(index),[zoom,setZoom]=useState(1),[position,setPosition]=useState({x:0,y:0}),[meta,setMeta]=useState({width:0,height:0,bytes:0}),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const current=images[active];
  const move=useCallback((delta:number)=>setActive(value=>(value+delta+images.length)%images.length),[images.length]);
  useEffect(()=>{const fn=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();if(event.key==="ArrowLeft")move(-1);if(event.key==="ArrowRight")move(1)};window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn)},[onClose,move]);
  useEffect(()=>{setZoom(1);setPosition({x:0,y:0});setMeta({width:0,height:0,bytes:0});if(!current)return;void fetch(current,{method:"HEAD"}).then(response=>setMeta(value=>({...value,bytes:Number(response.headers.get("content-length")||0)}))).catch(()=>{})},[current]);
  function pointerDown(event:React.PointerEvent){drag.current={x:event.clientX,y:event.clientY,left:position.x,top:position.y};event.currentTarget.setPointerCapture(event.pointerId)}
  function pointerMove(event:React.PointerEvent){if(!drag.current)return;setPosition({x:drag.current.left+event.clientX-drag.current.x,y:drag.current.top+event.clientY-drag.current.y})}
  function pointerUp(){drag.current=null}
  if (!images[active]) return null;
  return <div className="dialog-backdrop" onClick={onClose} role="dialog" aria-modal="true">
    <button className="dialog-close" onClick={onClose}>×</button>
    <div className="image-dialog" data-photo-copy-ignore onClick={(e)=>e.stopPropagation()}>
      <div className="image-dialog-stage" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        <img src={current} alt="大图预览" draggable={false} onLoad={event=>{const width=event.currentTarget.naturalWidth,height=event.currentTarget.naturalHeight;setMeta(value=>({...value,width,height}))}} style={{transform:`translate(${position.x}px,${position.y}px) scale(${zoom})`}}/>
      </div>
      <div className="image-meta">{meta.width>0?`${meta.width} × ${meta.height}px`:"读取原始尺寸中"} · {meta.bytes>0?`${(meta.bytes/1024/1024).toFixed(2)} MB`:"读取文件大小中"} · {active+1}/{images.length}</div>
      {images.length>1&&<div className="dialog-thumbnails">{images.map((url,itemIndex)=><button key={`${url}-${itemIndex}`} className={itemIndex===active?"active":""} onClick={()=>setActive(itemIndex)}><img src={thumbnailUrl(url,240)} alt={`缩略图 ${itemIndex+1}`}/></button>)}</div>}
      <div className="dialog-tools"><button onClick={()=>setZoom(value=>Math.max(.5,value-.25))}>− 缩小</button><button onClick={()=>{setZoom(1);setPosition({x:0,y:0})}}>适应窗口</button><button onClick={()=>setZoom(value=>Math.min(4,value+.25))}>＋ 放大</button>{images.length>1&&<><button onClick={()=>move(-1)}>上一张</button><button onClick={()=>move(1)}>下一张</button></>}<a href={current} download>下载</a><CopyImageButton url={current}/></div>
    </div>
  </div>;
}
