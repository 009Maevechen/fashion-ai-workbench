import "server-only";
import type {
  ModelCapability,
  ModelWorkflowType,
} from "./provider-settings-types";

export {
  CAPABILITY_LABELS,
  capabilitiesMatch,
  inferCapabilities,
  missingCapabilities,
} from "../model-capability-utils";

/**
 * 每个工作流所需的模型能力。分配模型时据此校验，能力不匹配则拒绝保存。
 */
export const WORKFLOW_REQUIRED_CAPABILITIES: Record<
  ModelWorkflowType,
  ModelCapability[]
> = {
  product: ["vision"],
  tryon: ["image-editing", "multi-image"],
  pose: ["image-editing", "multi-image"],
  recolor: ["image-editing"],
  qc: ["vision"],
  research: ["text", "reasoning"],
  assistant: ["text"],
  correction: ["text"],
  "prompt-optimize": ["prompt-optimization"],
};

export const WORKFLOW_LABELS: Record<ModelWorkflowType, string> = {
  product: "商品视觉识别",
  tryon: "服装换装",
  pose: "三种姿势",
  recolor: "服装复色",
  qc: "QC质量检查",
  research: "爆款研究 / 文本分析",
  assistant: "工作台AI助手",
  correction: "咒语矫正",
  "prompt-optimize": "Prompt优化模型",
};

export const WORKFLOW_DESCRIPTIONS: Record<ModelWorkflowType, string> = {
  product: "产品类型识别、商品属性识别、细节提取、自动标签",
  tryon: "产品图 + 模特图换装",
  pose: "商品模特图 + 姿势参考图",
  recolor: "三姿势 + 颜色参考",
  qc: "商品结构比对、模特一致性、面料、手部异常、露脸检测",
  research: "爆款共同点总结、趋势研究、设计Brief、卖点总结",
  assistant: "工作台内的通用文本问答助手",
  correction: "把用户口语化的修改要求改写成精确、严格按方向的修改指令",
  "prompt-optimize": "把简单中文咒语整理成结构化高质量 Prompt，再交给图片模型执行",
};
