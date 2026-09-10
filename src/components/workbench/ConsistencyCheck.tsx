"use client";
import type {Job} from "@/lib/db";

export default function ConsistencyCheck({job,busy,onCheck}:{job?:Job;busy:boolean;onCheck:()=>void}){
  if(!job?.outputImages[0])return null;
  const check=job.consistencyCheck;
  const idleLabel=job.workflow==="pose"?"AI人物与服装一致性 · 未检测":"AI服装一致性 · 未检测";
  return <div className={`consistency-check ${check?.status||"idle"}`}>
    <div><b>{check?check.status==="passed"?`AI检测通过 · ${check.score}分`:check.status==="failed"?`AI检测失败 · ${check.score}分`:`AI建议复核 · ${check.score}分`:idleLabel}</b>{check&&<small>{check.summary}</small>}</div>
    <button type="button" className="secondary" disabled={busy} onClick={onCheck}>{check?"重新检测":"开始检测"}</button>
    {check?.issues.length?<details><summary>查看 {check.issues.length} 项差异</summary><ul>{check.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul></details>:null}
  </div>;
}
