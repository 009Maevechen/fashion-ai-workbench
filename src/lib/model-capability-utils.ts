import type {
  ApiProviderType,
  ModelCapability,
} from "./ai/provider-settings-types";

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

const IMAGE_GEN_PATTERN = /(?:gpt[-_.]?image|seedream|flux|dall[-_.]?e|imagen|midjourney|stable[-_.]?diffusion|sdxl|doubao[-_.]?image)/i;
// 视觉理解：覆盖 GPT-5 / GPT-4.x（4o、4.1 等新版均为多模态）、4-vision、qwen-vl、gemini、claude、豆包/DeepSeek/月之暗面/GLM 的 VL 系列。
const VISION_PATTERN = /(?:gpt[-_.]?5|gpt[-_.]?4|gpt[-_.]?4[-_.]?(?:vision|o)|gpt[-_.]?4[-_.]?1|vision|vl|qwen[-_.]?vl|gemini|claude|doubao[-_.]?(?:vision|vl)|deepseek[-_.]?vl|moonshot[-_.]?vl|glm[-_.]?4v|omni|multimodal)/i;
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
