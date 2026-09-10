"use client";
import { useState } from "react";
import type { Job } from "@/lib/db";
import type { CorrectionCommandPlan } from "@/lib/correction-command";
import { thumbnailUrl } from "@/lib/image-url";
import CopyImageButton from "./CopyImageButton";

const LABELS: Record<string, string> = {
  queued: "等待模型",
  generating: "正在生成",
  success: "生成成功",
  failed: "生成失败",
  needs_review: "需要人工审核",
  needs_redo: "细节不一致·需要重做",
  confirmed: "已确认",
  awaiting_confirmation: "等待确认",
  stale: "需要重新审核",
  interrupted: "任务已中断",
};
const PHASES: Record<string, string> = {
  queued: "等待中",
  uploading: "正在上传",
  submitting: "正在提交模型",
  waiting_provider: "等待模型",
  downloading: "正在下载",
  validating: "正在校验",
  optimizing: "正在优化",
  saving: "正在保存",
  success: "已保存",
  failed: "失败",
  interrupted: "已中断",
};
export default function ResultCard({
  job,
  label,
  pending,
  selected,
  onSelect,
  onPreview,
  onRetry,
  onFallbackRetry,
  onCorrect,
  onInpaint,
  correctionBusy,
}: {
  job?: Job;
  label: string;
  pending?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onPreview?: () => void;
  onRetry?: () => void;
  onFallbackRetry?: () => void;
  onCorrect?: (request: string, plan: CorrectionCommandPlan) => void;
  onInpaint?: () => void;
  correctionBusy?: boolean;
}) {
  const [correction, setCorrection] = useState("");
  const [commandPlan, setCommandPlan] = useState<CorrectionCommandPlan | null>(
      null,
    ),
    [parsing, setParsing] = useState(false),
    [parseError, setParseError] = useState("");
  async function parseCommand() {
    setParsing(true);
    setParseError("");
    try {
      const response = await fetch("/api/correction/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: correction.trim() }),
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error || "咒语解析失败");
      setCommandPlan(data.plan);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "咒语解析失败");
    } finally {
      setParsing(false);
    }
  }
  const url = job?.outputImages[0],
    status = job?.status || (pending ? "queued" : "idle"),
    labelText =
      job?.phase && !["success", "failed"].includes(job.phase)
        ? PHASES[job.phase]
        : LABELS[status] || "等待生成";
  return (
    <article className={selected ? "result-card selected" : "result-card"}>
      <div className="result-title">
        <b>{label}</b>
        <span
          className={`badge ${status === "failed" || status === "interrupted" || status === "needs_redo" ? "failed" : status === "confirmed" || status === "success" ? "success" : "wait"}`}
        >
          {labelText}
        </span>
      </div>
      {url ? (
        <button
          type="button"
          className="image-button"
          data-photo-copy-ignore
          onClick={onPreview}
          aria-label={`查看${label}大图`}
        >
          <img
            className="result-image"
            src={thumbnailUrl(url, 720)}
            alt={label}
          />
        </button>
      ) : (
        <div className="result-placeholder">
          <span>
            {status === "failed" || status === "interrupted"
              ? "本次生成失败\n输入素材已保留"
              : "生成结果将在这里显示"}
          </span>
        </div>
      )}
      {job?.qualityIssues && job.qualityIssues.length > 0 && (
        <div className="quality-issues">
          <b>
            {job?.correctionCheck && !job.correctionCheck.passed
              ? "咒语命令未通过"
              : status === "needs_redo"
                ? "服装细节未通过"
                : "画质需复核"}
          </b>
          {job.qualityIssues.map((issue, index) => (
            <span key={index}>{issue}</span>
          ))}
        </div>
      )}
      {job?.consistencyCheck && (
        <div className={`subject-fidelity ${job.consistencyCheck.status}`}>
          <b>
            {job.consistencyCheck.status === "passed"
              ? "服装细节校验通过"
              : job.consistencyCheck.status === "needs_redo" ||
                  job.consistencyCheck.status === "failed"
                ? "服装细节校验未通过"
                : "服装细节需要复核"}
            {job.consistencyCheck.score !== undefined
              ? ` · ${job.consistencyCheck.score}分`
              : ""}
          </b>
          <span>{job.consistencyCheck.summary}</span>
          {job.consistencyCheck.issues.length > 0 && (
            <details>
              <summary>
                查看 {job.consistencyCheck.issues.length} 项细节问题
              </summary>
              <ul>
                {job.consistencyCheck.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {job?.subjectFidelity && (
        <div className={`subject-fidelity ${job.subjectFidelity.status}`}>
          <b>
            {job.subjectFidelity.status === "passed"
              ? "换装主体校验通过"
              : job.subjectFidelity.status === "failed"
                ? "换装主体校验失败"
                : "换装主体需复核"}{" "}
            · {job.subjectFidelity.score}分
          </b>
          <span>{job.subjectFidelity.summary}</span>
          {job.subjectFidelity.issues.length > 0 && (
            <details>
              <summary>查看 {job.subjectFidelity.issues.length} 项问题</summary>
              <ul>
                {job.subjectFidelity.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {job?.correctionPlan && (
        <details className="correction-plan correction-plan-persisted">
          <summary>查看本次实际执行的强制规则</summary>
          <span>原始咒语：{job.correctionPlan.original}</span>
          <span>必须修改：{job.correctionPlan.mustChange.join("；")}</span>
          <span>必须保留：{job.correctionPlan.mustKeep.join("；")}</span>
          <span>
            禁止修改：{job.correctionPlan.forbiddenChanges.join("；")}
          </span>
          <span>
            验收条件：{job.correctionPlan.acceptanceCriteria.join("；")}
          </span>
        </details>
      )}
      {job?.correctionCheck && (
        <div
          className={`subject-fidelity ${job.correctionCheck.passed ? "passed" : "needs_redo"}`}
        >
          <b>
            {job.correctionCheck.passed
              ? "咒语命中检查通过"
              : "咒语命中检查未通过"}{" "}
            · {job.correctionCheck.score}分
          </b>
          <span>{job.correctionCheck.summary}</span>
          {!job.correctionCheck.passed && (
            <details open>
              <summary>
                查看未命中与越界修改（
                {job.correctionCheck.missed.length +
                  job.correctionCheck.violations.length}
                项）
              </summary>
              <ul>
                {job.correctionCheck.missed.map((item, index) => (
                  <li key={`missed-${index}`}>未命中：{item}</li>
                ))}
                {job.correctionCheck.violations.map((item, index) => (
                  <li key={`violation-${index}`}>错误改变：{item}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <div className="result-actions">
        <button
          className="text-button"
          type="button"
          onClick={onPreview}
          disabled={!url}
        >
          ◉ 查看大图
        </button>
        {url && (
          <a className="text-button" href={url} download>
            ↓ 下载
          </a>
        )}
        {url && <CopyImageButton url={url} />}
        <button className="text-button" type="button" onClick={onRetry}>
          ↻ 重新生成
        </button>
        {url && onInpaint && (
          <button
            className="text-button inpaint-button"
            type="button"
            onClick={onInpaint}
          >
            🖌 局部重绘
          </button>
        )}
        {(status === "failed" ||
          status === "interrupted" ||
          status === "needs_redo") &&
          onFallbackRetry && (
            <button
              className="text-button fallback-button"
              type="button"
              onClick={onFallbackRetry}
            >
              备用模型重试
            </button>
          )}
      </div>
      {job && (
        <small className="job-model-line">
          {job.provider} · {job.model}
          {job.modelSlot === "fallback" ? "（备用）" : ""}
        </small>
      )}
      {(job?.error || job?.errorMessage) && (
        <details className="error">
          <summary>查看错误原因</summary>
          {job.error || job.errorMessage}
        </details>
      )}
      {url && onCorrect && (
        <details className="result-correction">
          <summary className="spell-collapse-summary">
            <span>
              <b>✨ 咒语矫正</b>
              <small>需要修改图片时点开</small>
            </span>
            <span className="spell-collapse-state" aria-hidden="true">
              <span className="collapsed">展开</span>
              <span className="expanded">收起</span>
              <span className="chevron">⌄</span>
            </span>
          </summary>
          <div className="result-correction-body">
            <label>
              <b>修改命令</b>
              <small>用户命令为最高优先级；先解析确认，再执行。</small>
              <textarea
                maxLength={800}
                value={correction}
                onChange={(event) => {
                  setCorrection(event.target.value);
                  setCommandPlan(null);
                }}
                placeholder="例如：扣子必须改成3个；黑色包边保持黑色；其余区域不能改变。"
              />
            </label>
            {commandPlan && (
              <div className="correction-plan">
                <b>强制修改规则</b>
                <span>必须修改：{commandPlan.mustChange.join("；")}</span>
                <span>必须保留：{commandPlan.mustKeep.join("；")}</span>
                <span>禁止修改：{commandPlan.forbiddenChanges.join("；")}</span>
                <span>参考来源：{commandPlan.referenceSources.join("；")}</span>
                <span>验收条件：{commandPlan.acceptanceCriteria.join("；")}</span>
              </div>
            )}
            {parseError && <small className="error">{parseError}</small>}
            <div className="result-correction-actions">
              <span>{correction.length}/800</span>
              {commandPlan ? (
                <button
                  className="secondary"
                  type="button"
                  disabled={correctionBusy}
                  onClick={() => onCorrect(commandPlan.original, commandPlan)}
                >
                  {correctionBusy ? "正在执行…" : "确认规则并强制执行"}
                </button>
              ) : (
                <button
                  className="secondary"
                  type="button"
                  disabled={correctionBusy || parsing || !correction.trim()}
                  onClick={() => void parseCommand()}
                >
                  {parsing ? "解析中…" : "解析强制命令"}
                </button>
              )}
            </div>
          </div>
        </details>
      )}
      {url && onSelect && (
        <label className="select-row">
          <input type="radio" checked={selected} onChange={onSelect} />
          {selected ? "已选择此结果" : "选择此结果"}
        </label>
      )}
    </article>
  );
}
