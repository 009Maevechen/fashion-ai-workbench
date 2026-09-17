import { listJobs, listProjects } from "@/lib/db";
import ProjectList from "@/components/ProjectList";
import SpreadsheetProductionEntry from "@/components/SpreadsheetProductionEntry";
import { listSpreadsheetImports } from "@/lib/spreadsheet-import-store";
import { spreadsheetUploadLimitMb } from "@/lib/table-parse";

export const dynamic="force-dynamic";

export default async function WorkbenchHome(){
  const [projects,jobs,imports]=await Promise.all([listProjects(),listJobs(),listSpreadsheetImports()]);
  const today=new Date();today.setHours(0,0,0,0);
  const stats=[
    ["今日生成任务",jobs.filter(j=>new Date(j.startedAt)>=today).length,"来自真实任务"],
    ["等待人工审核",jobs.filter(j=>j.status==="needs_review").length,"需要选择或确认"],
    ["生成失败",jobs.filter(j=>j.status==="failed").length,"可进入历史任务重试"],
    ["本月预计消耗","—","费用数据暂不可用"],
  ];
  return <main className="workbench-home"><header className="page-head workbench-home-head"><div><div className="eyebrow">SKU VISUAL PRODUCTION</div><h1>SKU 视觉生产工作台</h1><p>以 WPS / Excel 商品表格驱动服装分析、任务匹配、生成与质检。</p></div><span className="page-context">生产总览</span></header><SpreadsheetProductionEntry initial={imports} maxUploadMb={spreadsheetUploadLimitMb()}/><div className="workbench-stats">{stats.map(([name,value,note],index)=><section className={`card workbench-stat stat-${index+1}`} key={name}><small>{name}</small><strong>{value}</strong><span>{note}</span></section>)}</div><ProjectList initial={projects}/></main>;
}
