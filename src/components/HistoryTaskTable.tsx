import type {Job,Project} from "@/lib/db";
import Link from "next/link";
import {formatDateTime} from "@/lib/date-format";

const STEP_LABELS:Record<number,string>={1:"商品资料",2:"服装换装",3:"三种姿势",4:"色卡复色",5:"最终结果"};
const STEP_ROUTES:Record<number,string>={1:"details",2:"tryon",3:"pose",4:"recolor",5:"final"};

function projectHref(project:Project){const step=Math.max(1,Math.min(5,project.currentStep||1));return `/projects/${project.id}/${STEP_ROUTES[step]}`}
function assetCount(project:Project,jobs:Job[]){
  const values=Object.values(project.assets||{}),urls=values.flatMap(value=>typeof value==="string"?[value]:Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[]);
  for(const url of [project.confirmedTryonImage,...(project.confirmedPoseImages||[]),...(project.confirmedRecolorImages||[]),...jobs.flatMap(job=>job.outputImages)])if(url)urls.push(url);
  return new Set(urls).size;
}

export default function HistoryTaskTable({initialJobs,projects}:{initialJobs:Job[];projects:Project[]}){
  if(!projects.length)return <div className="empty-state">没有符合条件的商品项目文件。</div>;
  return <div className="history-project-files">{projects.map(project=>{
    const jobs=initialJobs.filter(job=>job.projectId===project.id),failed=jobs.filter(job=>job.status==="failed"||job.status==="interrupted").length,running=jobs.some(job=>["queued","generating","uploading","submitting","waiting_provider","downloading","validating","saving"].includes(job.phase||job.status)),step=Math.max(1,Math.min(5,project.currentStep||1));
    return <Link className="history-project-file" href={projectHref(project)} prefetch={false} draggable={false} key={project.id}>
      <span className="history-project-file-icon" aria-hidden="true">📁</span>
      <span className="history-project-file-main"><b>{project.sku}</b><strong>{project.productName||"未命名商品"}</strong><small>{project.productType} · 当前步骤：{STEP_LABELS[step]}</small></span>
      <span className="history-project-file-stats"><span>{assetCount(project,jobs)} 张图片</span><span>{jobs.length} 次生成记录</span>{failed>0&&<span className="danger-text">{failed} 项失败</span>}</span>
      <span className="history-project-file-state"><i className={`badge ${running?"wait":project.status==="已完成"?"success":""}`}>{running?"正在生成":project.status}</i><small>最近保存<br/>{formatDateTime(project.updatedAt)}</small><em>打开项目 →</em></span>
    </Link>;
  })}</div>;
}
