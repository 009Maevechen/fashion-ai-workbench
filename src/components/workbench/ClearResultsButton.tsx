"use client";

import {useState} from "react";

const LABELS={tryon:"换装",pose:"三种姿势",recolor:"服装复色"} as const;

export default function ClearResultsButton({workflow,disabled,onConfirm}:{workflow:keyof typeof LABELS;disabled:boolean;onConfirm:()=>Promise<void>}){
  const [open,setOpen]=useState(false),[clearing,setClearing]=useState(false),[error,setError]=useState("");
  async function confirmClear(){setClearing(true);setError("");try{await onConfirm();setOpen(false)}catch(reason){setError(reason instanceof Error?reason.message:"清空结果失败")}finally{setClearing(false)}}
  return <><button type="button" className="clear-assets-trigger" disabled={disabled||clearing} onClick={()=>{setError("");setOpen(true)}}>清空结果</button>{open&&<div className="confirm-dialog-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={`clear-${workflow}-results-title`}><h2 id={`clear-${workflow}-results-title`}>确认清空结果？</h2><p>将清空当前项目的{LABELS[workflow]}生成结果和对应确认状态，上传素材及其他模块结果不会删除。</p>{error&&<div className="error">{error}</div>}<div className="confirm-dialog-actions"><button type="button" className="secondary" disabled={clearing} onClick={()=>setOpen(false)}>取消</button><button type="button" className="danger-soft" disabled={clearing} onClick={()=>void confirmClear()}>{clearing?"正在清空…":"确认清空"}</button></div></section></div>}</>;
}
