"use client";

import {useState} from "react";

export default function ClearAssetsButton({disabled,onConfirm}:{disabled:boolean;onConfirm:()=>Promise<void>}){
  const [open,setOpen]=useState(false),[clearing,setClearing]=useState(false),[error,setError]=useState("");
  async function confirmClear(){setClearing(true);setError("");try{await onConfirm();setOpen(false)}catch(reason){setError(reason instanceof Error?reason.message:"清空素材失败")}finally{setClearing(false)}}
  return <><button type="button" className="clear-assets-trigger" disabled={disabled||clearing} onClick={()=>{setError("");setOpen(true)}}>清空素材</button>{open&&<div className="confirm-dialog-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-assets-title"><h2 id="clear-assets-title">确认清空素材？</h2><p>将清空当前任务上传的产品图、模特图和颜色参考图，不会删除已经生成的结果图片。</p>{error&&<div className="error">{error}</div>}<div className="confirm-dialog-actions"><button type="button" className="secondary" disabled={clearing} onClick={()=>setOpen(false)}>取消</button><button type="button" className="danger-soft" disabled={clearing} onClick={()=>void confirmClear()}>{clearing?"正在清空…":"确认清空"}</button></div></section></div>}</>;
}
