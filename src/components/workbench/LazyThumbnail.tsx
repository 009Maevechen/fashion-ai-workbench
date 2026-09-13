"use client";
import {useEffect,useRef,useState,type ImgHTMLAttributes} from "react";

/** Does not assign img.src until the thumbnail is near the viewport. */
export default function LazyThumbnail({src,alt,...props}:ImgHTMLAttributes<HTMLImageElement> & {src:string;alt:string}){
  const ref=useRef<HTMLImageElement>(null),[visible,setVisible]=useState(false);
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    if(!("IntersectionObserver" in globalThis)){setVisible(true);return}
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect()}},{rootMargin:"240px 0px"});
    observer.observe(element);return()=>observer.disconnect();
  },[]);
  return <img ref={ref} src={visible?src:undefined} data-thumbnail-src={src} alt={alt} loading="lazy" decoding="async" {...props}/>;
}
