import { listJobs, listProjects } from "@/lib/db";
import ProjectList from "@/components/ProjectList";

export const dynamic="force-dynamic";

export default async function WorkbenchHome(){
  const projects=await listProjects(),jobs=await listJobs();
  const today=new Date();today.setHours(0,0,0,0);
  const stats=[
    ["今日生成任务",jobs.filter(j=>new Date(j.startedAt)>=today).length,"来自真实任务"],
    ["等待人工审核",jobs.filter(j=>j.status==="needs_review").length,"需要选择或确认"],
    ["生成失败",jobs.filter(j=>j.status==="failed").length,"可进入历史任务重试"],
    ["本月预计消耗","—","费用数据暂不可用"],
  ];
  return <><header className="page-head"><div><div className="eyebrow">TODAY&apos;S WORKSPACE</div><h1>今日工作台</h1><p>管理 SKU 项目，继续服装换装、姿势与复色流程。</p></div></header><div className="grid" style={{gridTemplateColumns:"repeat(4,1fr)",marginBottom:14}}>{stats.map(([name,value,note])=><section className="card" key={name}><small>{name}</small><div style={{fontSize:28,fontWeight:800,margin:"9px 0"}}>{value}</div><small style={{color:"var(--muted)"}}>{note}</small></section>)}</div><ProjectList initial={projects}/></>;
}
