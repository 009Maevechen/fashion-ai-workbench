"use client";
import {useState} from "react";
import type {Job} from "@/lib/db";
import InpaintEditor from "./InpaintEditor";

export type InpaintRequest = {
  sourceImageId: string;
  sourceStep: Job["workflow"];
  sourceUrl: string;
  maskDataUrl: string;
  editPrompt: string;
};

/**
 * 局部重绘对话框：画笔选区 + 修改咒语 + 提交生成 + 前后对比 + 确认/放弃。
 */
export default function InpaintDialog({
  job,
  sourceStep,
  busy,
  onSubmit,
  onClose,
}: {
  job: Job;
  sourceStep: Job["workflow"];
  busy: boolean;
  onSubmit: (request: InpaintRequest) => void;
  onClose: () => void;
}) {
  const sourceUrl = job.outputImages[0];
  const [mask, setMask] = useState<{ dataUrl: string; hasMask: boolean }>({ dataUrl: "", hasMask: false });
  const [editPrompt, setEditPrompt] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function submit() {
    if (!mask.hasMask) {
      setError("请先用画笔涂抹出需要修改的区域");
      return;
    }
    if (!editPrompt.trim()) {
      setError("请输入修改咒语");
      return;
    }
    setError("");
    onSubmit({
      sourceImageId: job.id,
      sourceStep,
      sourceUrl,
      maskDataUrl: mask.dataUrl,
      editPrompt: editPrompt.trim(),
    });
    setSubmitted(true);
  }

  return (
    <div className="inpaint-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <section className="inpaint-dialog" role="dialog" aria-modal="true" aria-label="局部重绘">
        <header className="inpaint-dialog-head">
          <div>
            <small>LOCAL INPAINTING</small>
            <h2>局部重绘</h2>
            <p>用画笔圈出要修改的区域，输入咒语，只改选中区域，其余保持不动。</p>
          </div>
          <button type="button" className="settings-dialog-close" aria-label="关闭" disabled={busy} onClick={onClose}>×</button>
        </header>
        <div className="inpaint-dialog-body">
          <InpaintEditor src={sourceUrl} onChange={setMask} />
          <div className="inpaint-prompt-area">
            <details className="inpaint-spell-collapse">
              <summary className="spell-collapse-summary">
                <span>
                  <b>✨ 修改咒语</b>
                  <small>框选完成后点开填写</small>
                </span>
                <span className="spell-collapse-state" aria-hidden="true">
                  <span className="collapsed">展开</span>
                  <span className="expanded">收起</span>
                  <span className="chevron">⌄</span>
                </span>
              </summary>
              <div className="inpaint-spell-body">
                <label className="field">修改咒语<textarea maxLength={800} placeholder="例如：把这个口袋去掉 / 把裤脚改宽一点 / 把这一块颜色改成黑色" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} /><span className="field-count">{editPrompt.length}/800</span></label>
              </div>
            </details>
            {error && <div className="error">{error}</div>}
            <div className="inpaint-actions">
              <button type="button" className="secondary" disabled={busy} onClick={onClose}>取消</button>
              <button type="button" className="primary" disabled={busy || !mask.hasMask || !editPrompt.trim()} onClick={submit}>{busy ? "生成中…" : "开始局部重绘"}</button>
            </div>
          </div>
        </div>
        {submitted && (
          <div className="inpaint-result-preview">
            <div className="panel-head"><h3>局部重绘已提交</h3></div>
            <p className="inpaint-hint">任务已进入统一任务队列，可稍后在任务中心或历史记录中查看结果。原图不会被覆盖。</p>
          </div>
        )}
      </section>
    </div>
  );
}
