"use client";

import {useEffect,useRef,useState} from "react";
import CopyImageButton from "./CopyImageButton";
import {originalImageUrl} from "@/lib/image-url";

type ActivePhoto={element:HTMLImageElement;url:string;top:number;left:number};

function positionFor(image:HTMLImageElement):ActivePhoto|null{
  const rect=image.getBoundingClientRect();
  if(rect.width<36||rect.height<36||rect.bottom<0||rect.right<0||rect.top>window.innerHeight||rect.left>window.innerWidth)return null;
  return {element:image,url:originalImageUrl(image.currentSrc||image.src),top:Math.max(8,rect.top+8),left:Math.max(8,Math.min(window.innerWidth-42,rect.right-40))};
}

export default function PhotoCopyLayer(){
  const [active,setActive]=useState<ActivePhoto|null>(null),[notice,setNotice]=useState<{message:string;error:boolean}|null>(null),current=useRef<HTMLImageElement|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{
    const show=(image:HTMLImageElement|null)=>{current.current=image;setActive(image?positionFor(image):null)};
    const over=(event:PointerEvent)=>{const target=event.target;if(target instanceof HTMLImageElement&&!target.closest("[data-photo-copy-ignore]"))show(target)};
    const out=(event:PointerEvent)=>{if(!(event.target instanceof HTMLImageElement))return;const next=event.relatedTarget;if(next instanceof Element&&next.closest(".photo-copy-floating"))return;show(null)};
    const focus=(event:FocusEvent)=>{const target=event.target;if(!(target instanceof Element))return;const image=target instanceof HTMLImageElement?target:target.querySelector("img");if(image instanceof HTMLImageElement&&!image.closest("[data-photo-copy-ignore]"))show(image)};
    const reposition=()=>{if(current.current)setActive(positionFor(current.current))};
    const result=(event:Event)=>{const detail=(event as CustomEvent<{message:string;error:boolean}>).detail;if(!detail)return;setNotice(detail);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setNotice(null),2600)};
    document.addEventListener("pointerover",over,true);document.addEventListener("pointerout",out,true);document.addEventListener("focusin",focus,true);window.addEventListener("scroll",reposition,true);window.addEventListener("resize",reposition);window.addEventListener("workbench:copy-image-result",result);
    return()=>{document.removeEventListener("pointerover",over,true);document.removeEventListener("pointerout",out,true);document.removeEventListener("focusin",focus,true);window.removeEventListener("scroll",reposition,true);window.removeEventListener("resize",reposition);window.removeEventListener("workbench:copy-image-result",result);if(timer.current)clearTimeout(timer.current)};
  },[]);
  return <>{active&&<div className="photo-copy-floating" style={{top:active.top,left:active.left}} onPointerLeave={()=>{current.current=null;setActive(null)}}><CopyImageButton compact url={active.url}/></div>}{notice&&<div className={`photo-copy-toast${notice.error?" error":""}`} role="status">{notice.message}</div>}</>;
}
