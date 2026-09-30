"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ProductSystemId = "cocomoda" | "tooerp-us";
type ProductLookupAttempt = { system: ProductSystemId; systemName: string; code: string };
type ProductLookupResult = {
  ok: boolean;
  exactMatch?: boolean;
  sku?: string;
  urls?: string[];
  source?: ProductSystemId;
  sourceName?: string;
  attempts?: ProductLookupAttempt[];
  code?: string;
  error?: string;
};
type DesktopBridge = {
  openProductSystemLogin?: (systemId: ProductSystemId) => Promise<{ ok: boolean; message?: string }>;
  lookupProduct?: (sku: string) => Promise<ProductLookupResult>;
};

const systems: Array<{ id: ProductSystemId; name: string; shortName: string }> = [
  { id: "cocomoda", name: "COCO MODA 商品系统", shortName: "主系统" },
  { id: "tooerp-us", name: "美国商品系统", shortName: "备用系统" },
];

function desktopBridge() {
  return (window as Window & { desktop?: DesktopBridge }).desktop;
}

export default function SpreadsheetProductionEntry() {
  const router = useRouter();
  const [lookupSku, setLookupSku] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupResult, setLookupResult] = useState<ProductLookupResult | null>(null);
  const [lookupSelectedUrl, setLookupSelectedUrl] = useState("");
  const [lookupImportBusy, setLookupImportBusy] = useState(false);
  const [lookupNotice, setLookupNotice] = useState("");
  const lookupInFlight = useRef(false);

  useEffect(() => {
    const sku = new URLSearchParams(window.location.search).get("sku")?.trim() || "";
    if (sku) setLookupSku(sku);
  }, []);

  const queryProduct = useCallback(async (rawSku: string) => {
    const sku = rawSku.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(sku)) {
      setLookupResult({ ok: false, code: "invalid_sku", error: "请输入正确的商品货号（至少 2 位字母或数字）。" });
      setLookupSelectedUrl("");
      return;
    }
    const bridge = desktopBridge();
    if (!bridge?.lookupProduct) {
      setLookupResult({ ok: false, code: "desktop_only", error: "双系统自动查询只在工作台桌面版可用。请从桌面的 AI服装工作台.app 打开。" });
      return;
    }
    if (lookupInFlight.current) return;
    lookupInFlight.current = true;
    setLookupBusy(true);
    setLookupNotice("正在先查主系统；若未找到，将自动切换备用系统…");
    setLookupResult(null);
    setLookupSelectedUrl("");
    try {
      const rawResult = await bridge.lookupProduct(sku);
      const verified = rawResult.ok && rawResult.exactMatch === true && rawResult.urls?.length === 1;
      const result = verified ? rawResult : rawResult.ok ? { ...rawResult, ok: false, code: "exact_match_failed", error: `未能确认图片属于货号 ${sku}，已禁止展示相邻货号图片。` } : rawResult;
      setLookupResult(result);
      setLookupSelectedUrl(result.ok && result.urls?.[0] ? result.urls[0] : "");
      setLookupNotice(result.ok ? `已从${result.sourceName || "商品系统"}精确匹配货号 ${sku} 的高清商品图。` : "");
    } catch (cause) {
      setLookupResult({ ok: false, code: "connection_failed", error: cause instanceof Error ? cause.message : "双系统查询失败" });
      setLookupNotice("");
    } finally {
      lookupInFlight.current = false;
      setLookupBusy(false);
    }
  }, []);

  useEffect(() => {
    const sku = lookupSku.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(sku)) return;
    const timer = window.setTimeout(() => void queryProduct(sku), 700);
    return () => window.clearTimeout(timer);
  }, [lookupSku, queryProduct]);

  async function openProductLogin(systemId: ProductSystemId) {
    try {
      const result = await desktopBridge()?.openProductSystemLogin?.(systemId);
      setLookupNotice(result?.message || "请在商品系统窗口完成登录，再回到这里输入货号。");
    } catch (cause) {
      setLookupNotice(cause instanceof Error ? cause.message : "无法打开商品系统登录页");
    }
  }

  async function importLookupProduct() {
    const url = lookupSelectedUrl || lookupResult?.urls?.[0];
    const sku = lookupResult?.sku || lookupSku.trim();
    if (!url || !sku) return;
    setLookupImportBusy(true);
    setLookupNotice("正在保存高清产品图并建立商品任务…");
    try {
      const response = await fetch("/api/product-source/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, url, source: lookupResult?.source }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "商品图片导入失败");
      if (!data.projectId) throw new Error("商品图已经保存，但 SKU 任务建立失败");
      setLookupNotice("高清产品图已放入商品资料，正在进入详细识别页面…");
      router.push(`/projects/${data.projectId}/details?from=workbench&sku=${encodeURIComponent(sku)}&autoAnalyze=1`);
    } catch (cause) {
      setLookupNotice(cause instanceof Error ? cause.message : "商品图片导入失败");
    } finally {
      setLookupImportBusy(false);
    }
  }

  return <section className="card spreadsheet-production-entry product-lookup-entry">
    <div className="spreadsheet-entry-copy">
      <span className="section-kicker">货号直查 · 主要生产入口</span>
      <h2>输入货号，自动找到高清产品服装图</h2>
      <p>不再依赖商品表格。工作台先查询 COCO MODA 商品系统，未找到时自动切换美国商品系统；选定图片后自动建立或匹配 SKU，并把高清图放入商品资料开始服装识别。</p>
      <div className="spreadsheet-flow" aria-label="货号查询流程">
        {["输入货号", "查询主系统", "自动切换备用系统", "选择高清图", "建立 SKU", "AI识别服装"].map((item, index) => <span key={item}><b>{index + 1}</b>{item}</span>)}
      </div>
      <div className="product-system-priority" aria-label="商品系统查询顺序">
        {systems.map((system, index) => <div key={system.id}><span>{index + 1}</span><div><b>{system.shortName}</b><small>{system.name}</small></div></div>)}
      </div>
    </div>
    <div className="spreadsheet-import-box product-lookup-box">
      <div className="product-system-lookup">
        <label className="field product-system-lookup-field"><span>商品货号</span><input autoFocus value={lookupSku} onChange={(event) => setLookupSku(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void queryProduct(lookupSku); }} placeholder="例如 JR00507" inputMode="text" /></label>
        <button className="primary product-lookup-action" type="button" disabled={lookupBusy} onClick={() => void queryProduct(lookupSku)}>{lookupBusy ? "正在查询两个系统…" : "搜索高清商品图片"}</button>
        <div className="product-system-login-actions"><span>首次使用请分别登录一次：</span>{systems.map((system) => <button className="secondary" type="button" key={system.id} onClick={() => void openProductLogin(system.id)}>登录{system.shortName}</button>)}</div>
        {lookupBusy && <div className="product-system-search-progress"><span className="spinner" />主系统找不到会自动查询备用系统，无需重复点击。</div>}
        {lookupResult?.attempts?.length ? <div className="product-system-attempts">{lookupResult.attempts.map((attempt) => <span key={attempt.system} className={attempt.code === "success" ? "success" : attempt.code === "needs_login" || attempt.code === "image_unreadable" || attempt.code === "connection_failed" ? "wait" : "muted"}>{attempt.systemName}：{attempt.code === "success" ? "已找到" : attempt.code === "needs_login" ? "需要登录" : attempt.code === "image_unreadable" ? "已找到货号，图片读取失败" : attempt.code === "connection_failed" ? "页面加载失败，可重试" : "未找到，已切换"}</span>)}</div> : null}
        {lookupResult?.ok && lookupResult.exactMatch && lookupResult.urls?.length === 1 && <div className="product-system-result">
          <div className="product-system-gallery" aria-label="货号精确匹配的商品图"><div className="product-system-gallery-grid"><div className="product-system-thumb selected"><img src={lookupResult.urls[0]} alt={`${lookupResult.sku} 精确匹配商品图`} /><span>货号精确匹配</span></div></div></div>
          <div className="product-system-result-info"><b>{lookupResult.sku}</b><span>来源：{lookupResult.sourceName}</span><span>已核对货号文字与同一商品行，只返回该货号的 1 张高清图。</span><button className="primary" type="button" disabled={lookupImportBusy || !lookupSelectedUrl} onClick={() => void importLookupProduct()}>{lookupImportBusy ? "正在保存并识别…" : "使用该货号图片开始制作"}</button></div>
        </div>}
        {lookupResult && !lookupResult.ok && <div className="error product-system-error">{lookupResult.error}</div>}
        {lookupNotice && <div className="notice product-system-notice">{lookupNotice}</div>}
        <small>登录状态仅保存在桌面工作台的本机隔离会话中；账号和密码不会写入项目、前端页面或日志。</small>
      </div>
    </div>
  </section>;
}
