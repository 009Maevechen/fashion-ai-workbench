import type { WorkflowType } from "./types";
export type ModelWorkflowType =
  | WorkflowType
  | "product"
  | "qc"
  | "research"
  | "assistant";

export type ApiProviderType =
  | "openai-compatible"
  | "syc-openai-compatible"
  | "fashn"
  | "bfl"
  | "volcengine"
  | "flux"
  | "custom";

/** 模型能力标签：模型中心据此判断“这个模型能做什么、不能做什么”。 */
export type ModelCapability =
  | "text"
  | "reasoning"
  | "vision"
  | "image-generation"
  | "image-editing"
  | "multi-image"
  | "virtual-tryon"
  | "qc"
  | "embedding"
  | "ocr"
  | "upscale";

/** 模型库存条目：从已配置 Provider 推导出的可调度模型。 */
export type ModelInventoryEntry = {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  lastTestStatus: ProviderTestStatus;
  lastTestAt?: string;
  averageLatencyMs?: number;
  notes?: string;
  capabilities: ModelCapability[];
};

/** 模型任务记录：为模型实验室 / 成本统计预留。 */
export type ModelRunRecord = {
  id: string;
  workflowType: ModelWorkflowType;
  providerId: string;
  providerName: string;
  modelId: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  success: boolean;
  retryCount: number;
  qcResult?: "passed" | "needs_review" | "failed" | "skipped";
  errorMessage?: string;
  promptTemplateId?: string;
  promptVersion?: string;
  generationMode?: string;
  parameters?: Record<string, unknown>;
};
export type ProviderTestStatus =
  | "untested"
  | "success"
  | "failed"
  | "auth_failed"
  | "rate_limited"
  | "model_not_found";
export type SycTestStatus =
  | "untested"
  | "incomplete"
  | "success"
  | "failed"
  | "auth_failed"
  | "rate_limited"
  | "model_not_found";
export type ModelSlot = "primary" | "fallback";

export type ApiProviderPublic = {
  id: string;
  name: string;
  type: ApiProviderType;
  baseUrl: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  defaultModel: string;
  enabled: boolean;
  notes?: string;
  lastTestStatus: ProviderTestStatus;
  lastTestAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  imageModel?: string;
  visionModel?: string;
  chatModel?: string;
  stream?: boolean;
  partialImages?: number;
  returnBase64?: boolean;
  codexCliCompatible?: boolean;
  timeoutSeconds?: number;
  lastImageTestStatus?: SycTestStatus;
  lastImageTestAt?: string;
  lastImageTestError?: string;
  lastTestLatencyMs?: number;
};

export type ApiProviderSecretRecord = Omit<
  ApiProviderPublic,
  "apiKeyMasked" | "hasApiKey"
> & {
  encryptedApiKey: string;
  apiKeyMasked: string;
};

export type SycConfigPublic = {
  id: string;
  name: string;
  providerType: "syc-openai-compatible";
  baseUrl: string;
  apiKeyConfigured: boolean;
  apiKeyMask: string;
  imageModel: string;
  visionModel: string;
  chatModel: string;
  stream: boolean;
  partialImages: number;
  returnBase64: boolean;
  codexCliCompatible: boolean;
  timeoutSeconds: number;
  enabled: boolean;
  lastTestStatus: SycTestStatus;
  lastTestAt?: string;
  lastError?: string;
  lastImageTestStatus: SycTestStatus;
  lastImageTestAt?: string;
  lastImageTestError?: string;
  lastTestLatencyMs?: number;
};

export type SycConfigInput = {
  name: string;
  baseUrl: string;
  apiKey?: string;
  imageModel: string;
  visionModel?: string;
  chatModel?: string;
  stream: boolean;
  partialImages: number;
  returnBase64: boolean;
  codexCliCompatible: boolean;
  timeoutSeconds: number;
  enabled: boolean;
};

export type WorkflowModelSelection = { providerId: string; model: string };
export type WorkflowModelBinding = {
  primary?: WorkflowModelSelection;
  fallback?: WorkflowModelSelection;
};
export type WorkflowModelBindings = Record<
  ModelWorkflowType,
  WorkflowModelBinding
>;

export type ProviderRuntimeConfig = {
  id: string;
  name: string;
  type: ApiProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  source: "stored" | "environment";
  syc?: {
    stream: boolean;
    partialImages: number;
    returnBase64: boolean;
    codexCliCompatible: boolean;
    timeoutSeconds: number;
  };
};

export type WorkflowRuntimeModel = {
  slot: ModelSlot;
  configured: boolean;
  providerId?: string;
  providerName: string;
  providerType: string;
  model: string;
  source: "stored" | "environment" | "none";
  error?: string;
};

export type WorkflowRuntimeSummary = Record<
  ModelWorkflowType,
  { primary: WorkflowRuntimeModel; fallback: WorkflowRuntimeModel }
>;

export const EMPTY_WORKFLOW_BINDINGS: WorkflowModelBindings = {
  product: {},
  tryon: {},
  pose: {},
  recolor: {},
  qc: {},
  research: {},
  assistant: {},
};
