import "server-only";
import type {
  ApiProviderType,
  ModelCapability,
  ModelWorkflowType,
} from "./provider-settings-types";

export const CAPABILITY_LABELS: Record<ModelCapability, string> = {
  text: "文本理解",
  reasoning: "推理",
  vision: "视觉理解",
  "image-generation": "图片生成",
  "image-editing": "图片编辑",
  "multi-image": "多图输入",
  "virtual-tryon": "Virtual Try-On",
  qc: "QC质量检查",
  embedding: "Embedding",
  ocr: "OCR",
  upscale: "Upscale",
};

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
};

export const WORKFLOW_LABELS: Record<ModelWorkflowType, string> = {
  product: "商品视觉识别",
  tryon: "服装换装",
  pose: "三种姿势",
  recolor: "服装复色",
  qc: "QC质量检查",
  research: "爆款研究 / 文本分析",
  assistant: "工作台AI助手",
};

export const WORKFLOW_DESCRIPTIONS: Record<ModelWorkflowType, string> = {
  product: "产品类型识别、商品属性识别、细节提取、自动标签",
  tryon: "产品图 + 模特图换装",
  pose: "商品模特图 + 姿势参考图",
  recolor: "三姿势 + 颜色参考",
  qc: "商品结构比对、模特一致性、面料、手部异常、露脸检测",
  research: "爆款共同点总结、趋势研究、设计Brief、卖点总结",
  assistant: "工作台内的通用文本问答助手",
};

const IMAGE_GEN_PATTERN = /(?:gpt[-_.]?image|seedream|flux|dall[-_.]?e|imagen|midjourney|stable[-_.]?diffusion|sdxl|doubao[-_.]?image)/i;
const VISION_PATTERN = /(?:gpt[-_.]?4o|gpt[-_.]?4[-_.]?vision|vision|vl|qwen[-_.]?vl|gemini|claude|doubao[-_.]?vision|deepseek[-_.]?vl|moonshot[-_.]?vl|glm[-_.]?4v)/i;
const TEXT_PATTERN = /(?:gpt|deepseek|qwen|glm|ernie|moonshot|kimi|claude|gemini|doubao|llama|mistral|mixtral|minimax|abab)/i;
const REASONING_PATTERN = /(?:deepseek[-_.]?r1|o1|o3|reasoner|reasoning|thinking|qwen3)/i;
const VTO_PATTERN = /(?:virtual[-_.]?try[-_.]?on|tryon|vto)/i;
const EMBEDDING_PATTERN = /(?:embedding|bge|text[-_.]?embedding)/i;
const OCR_PATTERN = /(?:ocr|document[-_.]?understanding)/i;
const UPSCALE_PATTERN = /(?:upscale|super[-_.]?resolution|sr|real[-_.]?esrgan)/i;

/**
 * 根据 Provider 类型与模型 ID 推断能力标签。
 * 不硬编码具体模型 ID，只做协议级 + 名称模式的保守推断；拿不准的标签不放进去。
 */
export function inferCapabilities(
  type: ApiProviderType,
  model: string,
): ModelCapability[] {
  const capabilities = new Set<ModelCapability>();
  const normalized = model.toLowerCase();
  if (type === "fashn" || type === "bfl" || VTO_PATTERN.test(normalized)) {
    capabilities.add("image-editing");
    capabilities.add("image-generation");
    capabilities.add("virtual-tryon");
    capabilities.add("multi-image");
    return [...capabilities];
  }
  // 火山方舟 / FLUX / 兼容图片接口默认支持图片生成与编辑
  if (type === "volcengine" || type === "flux") {
    capabilities.add("image-generation");
    capabilities.add("image-editing");
    capabilities.add("multi-image");
    if (VISION_PATTERN.test(normalized)) capabilities.add("vision");
    return [...capabilities];
  }
  if (type === "syc-openai-compatible" || type === "openai-compatible" || type === "custom") {
    if (IMAGE_GEN_PATTERN.test(normalized)) {
      capabilities.add("image-generation");
      capabilities.add("image-editing");
    }
    if (VISION_PATTERN.test(normalized)) capabilities.add("vision");
    if (REASONING_PATTERN.test(normalized)) capabilities.add("reasoning");
    if (TEXT_PATTERN.test(normalized)) capabilities.add("text");
    if (EMBEDDING_PATTERN.test(normalized)) capabilities.add("embedding");
    if (OCR_PATTERN.test(normalized)) capabilities.add("ocr");
    if (UPSCALE_PATTERN.test(normalized)) capabilities.add("upscale");
    return [...capabilities];
  }
  return [...capabilities];
}

export function capabilitiesMatch(
  modelCapabilities: ModelCapability[],
  required: ModelCapability[],
): boolean {
  return required.every((capability) => modelCapabilities.includes(capability));
}

export function missingCapabilities(
  modelCapabilities: ModelCapability[],
  required: ModelCapability[],
): ModelCapability[] {
  return required.filter((capability) => !modelCapabilities.includes(capability));
}
