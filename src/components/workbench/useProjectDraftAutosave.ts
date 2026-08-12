"use client";

import {useEffect,useRef} from "react";

/**
 * 将流程页面的草稿持续保存到当前项目；离开页面时再发送最后一次状态，
 * 避免用户在流程间切换后丢失尚未手动保存的设置。
 */
export function useProjectDraftAutosave(projectId:string,patch:unknown,delay=500){
  const serialized=JSON.stringify(patch),latest=useRef(serialized),mounted=useRef(false);
  latest.current=serialized;

  useEffect(()=>{
    if(!mounted.current){mounted.current=true;return}
    const timer=window.setTimeout(()=>{
      void fetch(`/api/projects/${projectId}`,{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:serialized,
        keepalive:true,
      }).catch(()=>{});
    },delay);
    return()=>window.clearTimeout(timer);
  },[delay,projectId,serialized]);

  useEffect(()=>()=>{
    void fetch(`/api/projects/${projectId}`,{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:latest.current,
      keepalive:true,
    }).catch(()=>{});
  },[projectId]);
}
