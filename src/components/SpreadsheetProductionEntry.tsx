"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SpreadsheetImportRecord } from "@/lib/spreadsheet-import-store";

export default function SpreadsheetProductionEntry({ initial, maxUploadMb }: { initial: SpreadsheetImportRecord[]; maxUploadMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [records, setRecords] = useState(initial);
  const [baseDirectory, setBaseDirectory] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState("");
  const [error, setError] = useState("");
  const latest = records[0];

  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > maxUploadMb * 1024 * 1024) {
      setError(`商品表格不能超过 ${maxUploadMb}MB`);
      if (input.current) input.current.value = "";
      return;
    }
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("file", file);
      if (baseDirectory.trim()) form.append("baseDirectory", baseDirectory.trim());
      const response = await fetch("/api/spreadsheet-imports", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "导入失败");
      setRecords((items) => [data, ...items.filter((item) => item.id !== data.id)]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "商品表格导入失败");
    } finally {
      setBusy(false); if (input.current) input.current.value = "";
    }
  }

  async function analyze(projectId: string) {
    setAnalyzing(projectId); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/sku-analysis`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI分析失败");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI分析失败");
    } finally { setAnalyzing(""); }
  }

  return <section className="card spreadsheet-production-entry">
    <div className="spreadsheet-entry-copy">
      <span className="section-kicker">主要生产入口</span>
      <h2>从 WPS / Excel 建立 SKU 视觉任务</h2>
      <p>每一行对应一个货号。工作台读取商品、模特、姿势与颜色参考图路径，自动建立分类、任务类型、颜色款和姿势建议；确认方案后再进入生图。</p>
      <div className="spreadsheet-flow" aria-label="表格生产流程">
        {['读取表格','识别 SKU','分析服装','匹配流程','人工确认','开始生产'].map((item,index)=><span key={item}><b>{index+1}</b>{item}</span>)}
      </div>
    </div>
    <div className="spreadsheet-import-box">
      <label className="field">图片根目录（表格已填写绝对路径时可留空）<input value={baseDirectory} onChange={(event)=>setBaseDirectory(event.target.value)} placeholder="例如 D:\\商品图片 或 /Users/name/商品图片" /></label>
      <input ref={input} hidden type="file" accept=".xlsx,.xlsm,.csv" onChange={(event)=>void importFile(event.target.files?.[0])}/>
      <button className="primary spreadsheet-import-action" disabled={busy} onClick={()=>input.current?.click()}>{busy?"正在读取并建立 SKU 任务…":"导入 WPS / Excel 商品表格"}</button>
      <small>支持 .xlsx / .xlsm / .csv，单个表格最大 {maxUploadMb}MB；旧版 .xls 请先另存为 .xlsx。原图只建路径索引，不重复复制。</small>
    </div>
    {error&&<div className="error full">{error}</div>}
    {latest&&<div className="spreadsheet-import-result">
      <div className="panel-head"><div><h3>最近导入：{latest.fileName}</h3><small>{latest.sheetName} · {new Date(latest.importedAt).toLocaleString("zh-CN")}</small></div><div className="spreadsheet-import-counts"><span>新建 <b>{latest.createdCount}</b></span><span>更新 <b>{latest.updatedCount}</b></span><span className={latest.failedCount?"warn":""}>问题 <b>{latest.failedCount}</b></span></div></div>
      <div className="spreadsheet-row-list">{latest.rows.slice(0,12).map((row)=><article key={`${row.rowNumber}-${row.sku||"empty"}`} className={`spreadsheet-row ${row.status}`}>
        <div><b>{row.sku||`第 ${row.rowNumber} 行`}</b><span>{row.status==="created"?"已建立 SKU 任务":row.status==="updated"?"已更新现有 SKU":"需要处理"}</span></div>
        <p>{row.issues.length?row.issues.join("；"):"字段完整，可进行商品 AI 分析"}</p>
        {row.projectId&&<div className="actions"><button className="secondary" disabled={Boolean(analyzing)} onClick={()=>void analyze(row.projectId!)}>{analyzing===row.projectId?"AI分析中…":"AI分析服装"}</button><button className="primary" onClick={()=>router.push(`/projects/${row.projectId}/details`)}>审核生产方案</button></div>}
      </article>)}</div>
      {latest.rows.length>12&&<small>本次共 {latest.rows.length} 行，当前展示前 12 行；完整任务已进入下方 SKU 列表。</small>}
    </div>}
  </section>;
}
