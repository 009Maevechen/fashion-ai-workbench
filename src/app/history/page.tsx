import HistoryTaskTable from "@/components/HistoryTaskTable";
import {listJobs,listProjects} from "@/lib/db";

export const dynamic="force-dynamic";

export default async function History({searchParams}:{searchParams:Promise<{sku?:string}>}){
  const q=await searchParams,[jobs,allProjects]=await Promise.all([listJobs(),listProjects()]),needle=q.sku?.trim().toLocaleLowerCase("zh-CN")||"",projects=needle?allProjects.filter(project=>project.sku.toLocaleLowerCase("zh-CN").includes(needle)||project.productName.toLocaleLowerCase("zh-CN").includes(needle)):allProjects;
  return <>
    <header className="page-head"><div><div className="eyebrow">Project files</div><h1>历史项目</h1><p>一个货号只保留一个项目文件入口。点击即可回到上次保存的制作流程，全部素材和结果持续保留。</p></div></header>
    <section className="card"><form className="form-grid history-project-filter"><label>按货号或商品名称查找<input name="sku" defaultValue={q.sku} placeholder="输入货号或商品名称"/></label><button>查找项目</button></form></section>
    <section className="card" style={{marginTop:18}}><HistoryTaskTable initialJobs={jobs} projects={projects}/></section>
  </>;
}
