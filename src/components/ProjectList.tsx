"use client";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import type {Project} from "@/lib/db";

export default function ProjectList({initial}:{initial:Project[]}){
  const [projects,setProjects]=useState(initial),[error,setError]=useState(""),[query,setQuery]=useState("");const router=useRouter();
  const [submitting,setSubmitting]=useState(false);
  const visible=useMemo(()=>{const keyword=query.trim().toLocaleLowerCase();return keyword?projects.filter(project=>project.sku.toLocaleLowerCase().includes(keyword)||project.productName.toLocaleLowerCase().includes(keyword)):projects},[projects,query]);
  async function create(form:FormData){setError("");const sku=String(form.get("sku")||"").trim();const productName=String(form.get("productName")||"").trim();const productType=String(form.get("productType")||"上衣");
    if(!sku)return setError("请填写 SKU 编号");
    if(!productName)return setError("请填写商品名称");
    const dup=projects.find(project=>project.sku.trim().toLocaleLowerCase()===sku.toLocaleLowerCase());
    if(dup)return setError(`SKU「${dup.sku}」已存在（商品名称：${dup.productName||"未命名"}），请换一个货号`);
    setSubmitting(true);
    try{
      const response=await fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sku,productName,productType})}),data=await response.json();
      if(!response.ok)return setError(data.error||"创建失败");
      setProjects(items=>[...items,data]);
      router.push(`/projects/${data.id}`);
    }finally{setSubmitting(false)}
  }
  async function remove(project:Project){if(!confirm(`确认删除项目“${project.sku}”？项目记录会被删除。`))return;const trash=confirm("是否同时把该项目的所有图片移入回收站？\n\n确定：删除记录并移动图片\n取消：只删除项目记录，保留图片");const response=await fetch(`/api/projects/${project.id}${trash?"?trash=1":""}`,{method:"DELETE"});if(!response.ok){const data=await response.json();setError(data.error||"删除失败");return}setProjects(items=>items.filter(item=>item.id!==project.id))}
  return <div className="stack project-list-stack">
    <section className="card project-create-card">
      <div className="panel-head">
        <div><span className="section-kicker">开始新任务</span><h2>新建商品项目</h2><small>创建一个 SKU，开始服装制作流程</small></div>
        <span className="badge">＋ NEW SKU</span>
      </div>
      <form action={create} className="form-grid project-create-form">
        <label className="field">SKU 编号<input name="sku" required maxLength={80}/></label>
        <label className="field">商品名称<input name="productName" required maxLength={120}/></label>
        <label className="field">商品类型<select name="productType">{["上衣","裤装","连衣裙","半身裙","套装"].map(item=><option key={item}>{item}</option>)}</select></label>
        <div className="actions"><button className="primary project-create-action" disabled={submitting}>{submitting?"创建中…":"新建并进入制作"}</button></div>
        {error&&<div className="error full">{error}</div>}
      </form>
    </section>
    <section className="card project-list-card">
      <div className="panel-head project-list-head">
        <div><span className="section-kicker">继续已有任务</span><h2>最近商品项目</h2><small>{query?`找到 ${visible.length} 个项目`:`共 ${projects.length} 个项目`}</small></div>
        <label className="project-search"><span>⌕</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索货号或商品名称" aria-label="搜索货号或商品名称"/>{query&&<button type="button" aria-label="清空搜索" onClick={()=>setQuery("")}>×</button>}</label>
      </div>
      {visible.length?<div className="table-scroll"><table className="table project-table"><thead><tr><th>SKU / 商品名称</th><th>商品类型</th><th>当前步骤</th><th>项目状态</th><th>最后更新时间</th><th aria-label="操作" /></tr></thead><tbody>{visible.map(project=><tr key={project.id}><td><strong>{project.sku}</strong><span className="project-product-name">{project.productName}</span></td><td>{project.productType}</td><td><span className="step-progress">{project.currentStep}<small>/ 5</small></span></td><td><span className="badge">{project.status}</span></td><td>{new Date(project.updatedAt).toLocaleString("zh-CN")}</td><td><div className="project-row-actions"><button className="primary" onClick={()=>router.push(`/projects/${project.id}/tryon`)}>继续制作</button><button className="danger" onClick={()=>void remove(project)}>删除</button></div></td></tr>)}</tbody></table></div>:<div className="empty-state"><div><div className="empty-icon">◇</div><b>{query?"没有找到匹配项目":"还没有商品项目"}</b><p>{query?"请检查货号或商品名称后重新搜索。":"创建一个 SKU 项目，开始服装制作流程。"}</p></div></div>}
    </section>
  </div>
}
