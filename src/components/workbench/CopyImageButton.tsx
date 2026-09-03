"use client";

import {useEffect,useRef,useState} from "react";
import {copyImageToClipboard} from "@/lib/copy-image";

export default function CopyImageButton({url,compact=false,className=""}:{url:string;compact?:boolean;className?:string}){
  const [state,setState]=useState<"idle"|"copying"|"copied"|"error">("idle"),[errorMessage,setErrorMessage]=useState(""),reset=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(reset.current)clearTimeout(reset.current)},[]);
  function report(message:string,error:boolean){window.dispatchEvent(new CustomEvent("workbench:copy-image-result",{detail:{message,error}}))}
  async function copy(){
    if(state==="copying")return;
    setState("copying");setErrorMessage("");
    try{await copyImageToClipboard(url);setState("copied");report("图片已复制，可以直接粘贴",false)}
    catch(error){const message=error instanceof Error?error.message:"复制图片失败";setErrorMessage(message);setState("error");report(message,true)}
    if(reset.current)clearTimeout(reset.current);
    reset.current=setTimeout(()=>setState("idle"),2200);
  }
  const label=state==="copying"?"复制中":state==="copied"?"已复制":state==="error"?"复制失败":"复制图片";
  return <button type="button" className={`copy-image-button${compact?" compact":""}${className?` ${className}`:""}`} disabled={state==="copying"} aria-label={label} title={errorMessage||label} onClick={event=>{event.preventDefault();event.stopPropagation();void copy()}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>{!compact&&<span>{label}</span>}</button>;
}
