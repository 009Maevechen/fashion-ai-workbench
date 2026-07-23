import HistoryTaskTable from "@/components/HistoryTaskTable";
import {listJobs,listProjects} from "@/lib/db";

export const dynamic="force-dynamic";

export default async function History({searchParams}:{searchParams:Promise<{sku?:string;workflow?:string}>}){
  const q=await searchParams,[jobs,projects]=await Promise.all([listJobs(q),listProjects()]);
  return <><header className="page-head"><div><div className="eyebrow">Audit trail</div><h1>历史任务</h1><p>查看真实输入、输出和失败原因；失败图片可以单独使用主模型或备用模型重试。</p></div></header><section className="card"><form className="form-grid"><label>按 SKU 筛选<input name="sku" defaultValue={q.sku}/></label><label>按工作流筛选<select name="workflow" defaultValue={q.workflow}><option value="">全部</option><option value="tryon">换装</option><option value="pose">姿势</option><option value="recolor">复色</option></select></label><button>筛选</button></form></section><section className="card" style={{marginTop:18}}><HistoryTaskTable initialJobs={jobs} projects={projects}/></section></>;
}
