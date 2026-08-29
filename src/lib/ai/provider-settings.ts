import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getModel } from "./config";
import type { GenerationMode, WorkflowType } from "./types";
import type {
  ApiProviderPublic,
  ApiProviderSecretRecord,
  ApiProviderType,
  ModelSlot,
  ModelWorkflowType,
  ProviderRuntimeConfig,
  ProviderTestStatus,
  SycConfigInput,
  SycConfigPublic,
  SycTestStatus,
  WorkflowModelBindings,
  WorkflowModelSelection,
  WorkflowRuntimeModel,
  WorkflowRuntimeSummary,
} from "./provider-settings-types";
import { EMPTY_WORKFLOW_BINDINGS } from "./provider-settings-types";
import { normalizeSycBaseUrl } from "./providers/syc/config";
import { runtimeDataDir } from "../runtime-paths";
import { WORKFLOW_REQUIRED_CAPABILITIES, capabilitiesMatch, inferCapabilities, missingCapabilities, CAPABILITY_LABELS } from "./model-capabilities";

type SettingsStore = {
  version: 1;
  apiProviders: ApiProviderSecretRecord[];
  workflowModelBindings: WorkflowModelBindings;
};
type ProviderInput = {
  name: string;
  type: ApiProviderType;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  enabled?: boolean;
  notes?: string;
};

const dataDir = runtimeDataDir();
const settingsFile = path.join(dataDir, "model-settings.json");
const keyFile = path.join(dataDir, ".provider-settings.key");
let mutationQueue = Promise.resolve();

const defaults = (): SettingsStore => ({
  version: 1,
  apiProviders: [],
  workflowModelBindings: structuredClone(EMPTY_WORKFLOW_BINDINGS),
});
const cleanBindings = (
  value?: Partial<WorkflowModelBindings>,
): WorkflowModelBindings => ({
  tryon: { ...(value?.tryon || {}) },
  pose: { ...(value?.pose || {}) },
  recolor: { ...(value?.recolor || {}) },
  product: { ...(value?.product || {}) },
  qc: { ...(value?.qc || {}) },
  research: { ...(value?.research || {}) },
  assistant: { ...(value?.assistant || {}) },
  correction: { ...(value?.correction || {}) },
  "prompt-optimize": { ...(value?.["prompt-optimize"] || {}) },
});

async function loadStore(): Promise<SettingsStore> {
  try {
    const parsed = JSON.parse(
      await fs.readFile(settingsFile, "utf8"),
    ) as Partial<SettingsStore>;
    return {
      version: 1,
      apiProviders: Array.isArray(parsed.apiProviders)
        ? parsed.apiProviders
        : [],
      workflowModelBindings: cleanBindings(parsed.workflowModelBindings),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.error("模型设置文件无法读取，将使用空配置");
    return defaults();
  }
}

async function mutate<T>(fn: (store: SettingsStore) => T | Promise<T>) {
  let result!: T;
  mutationQueue = mutationQueue.then(async () => {
    const store = await loadStore();
    result = await fn(store);
    await fs.mkdir(dataDir, { recursive: true });
    const temporary = `${settingsFile}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(store, null, 2), {
      mode: 0o600,
    });
    await fs.rename(temporary, settingsFile);
  });
  await mutationQueue;
  return result;
}

async function encryptionKey() {
  const configured = process.env.PROVIDER_SETTINGS_SECRET?.trim();
  if (configured)
    return crypto.createHash("sha256").update(configured).digest();
  try {
    return Buffer.from((await fs.readFile(keyFile, "utf8")).trim(), "base64");
  } catch {
    const key = crypto.randomBytes(32);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(keyFile, key.toString("base64"), { mode: 0o600 });
    return key;
  }
}

async function encrypt(secret: string) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", await encryptionKey(), iv),
    body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    body.toString("base64"),
  ].join(".");
}
async function decrypt(payload: string) {
  try {
    const [version, iv, tag, body] = payload.split(".");
    if (version !== "v1" || !iv || !tag || !body) throw new Error();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      await encryptionKey(),
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("API Key 无法解密，请重新编辑该提供商并填写密钥");
  }
}
function maskKey(key: string) {
  if (!key) return "未配置";
  if (key.length <= 8) return `${key.slice(0, 2)}••••${key.slice(-2)}`;
  return `${key.slice(0, 4)}••••••${key.slice(-4)}`;
}
function publicProvider(record: ApiProviderSecretRecord): ApiProviderPublic {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    baseUrl: record.baseUrl,
    apiKeyMasked: record.apiKeyMasked,
    hasApiKey: Boolean(record.encryptedApiKey),
    defaultModel: record.defaultModel,
    enabled: record.enabled,
    notes: record.notes,
    lastTestStatus: record.lastTestStatus,
    lastTestAt: record.lastTestAt,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    imageModel: record.imageModel,
    visionModel: record.visionModel,
    chatModel: record.chatModel,
    stream: record.stream,
    partialImages: record.partialImages,
    returnBase64: record.returnBase64,
    codexCliCompatible: record.codexCliCompatible,
    timeoutSeconds: record.timeoutSeconds,
    lastImageTestStatus: record.lastImageTestStatus,
    lastImageTestAt: record.lastImageTestAt,
    lastImageTestError: record.lastImageTestError,
    lastTestLatencyMs: record.lastTestLatencyMs,
  };
}
function validateUrl(raw: string) {
  if (!raw.trim()) throw new Error("Base URL 不能为空");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Base URL 不是有效网址");
  }
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Base URL 只支持 HTTP 或 HTTPS");
  if (
    url.protocol === "http:" &&
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
  )
    throw new Error("非本机 API 必须使用 HTTPS");
  if (url.username || url.password)
    throw new Error("Base URL 不得包含账号或密码");
  return url.toString().replace(/\/$/, "");
}
function validateInput(input: ProviderInput, requireKey = true) {
  if (!input.name.trim()) throw new Error("配置名称不能为空");
  if (!input.defaultModel.trim()) throw new Error("默认模型不能为空");
  if (requireKey && !input.apiKey?.trim()) throw new Error("API Key 不能为空");
  return {
    ...input,
    name: input.name.trim(),
    baseUrl: validateUrl(input.baseUrl),
    defaultModel: input.defaultModel.trim(),
    notes: input.notes?.trim() || undefined,
  };
}

export async function listApiProviders() {
  return (await loadStore()).apiProviders.map(publicProvider);
}
export async function getApiProvider(id: string) {
  const record = (await loadStore()).apiProviders.find(
    (item) => item.id === id,
  );
  return record ? publicProvider(record) : undefined;
}
export async function createApiProvider(input: ProviderInput) {
  const value = validateInput(input);
  const now = new Date().toISOString(),
    key = input.apiKey!.trim();
  return mutate(async (store) => {
    const record: ApiProviderSecretRecord = {
      id: crypto.randomUUID(),
      name: value.name,
      type: value.type,
      baseUrl: value.baseUrl,
      encryptedApiKey: await encrypt(key),
      apiKeyMasked: maskKey(key),
      defaultModel: value.defaultModel,
      enabled: value.enabled ?? true,
      notes: value.notes,
      lastTestStatus: "untested",
      lastImageTestStatus: "untested",
      createdAt: now,
      updatedAt: now,
    };
    store.apiProviders.push(record);
    return publicProvider(record);
  });
}
export async function updateApiProvider(
  id: string,
  input: Partial<ProviderInput>,
) {
  return mutate(async (store) => {
    const record = store.apiProviders.find((item) => item.id === id);
    if (!record) throw new Error("API 提供商不存在");
    const merged = validateInput(
      {
        name: input.name ?? record.name,
        type: input.type ?? record.type,
        baseUrl: input.baseUrl ?? record.baseUrl,
        apiKey: input.apiKey,
        defaultModel: input.defaultModel ?? record.defaultModel,
        enabled: input.enabled ?? record.enabled,
        notes: input.notes ?? record.notes,
      },
      false,
    );
    record.name = merged.name;
    record.type = merged.type;
    record.baseUrl = merged.baseUrl;
    record.defaultModel = merged.defaultModel;
    record.enabled = merged.enabled ?? record.enabled;
    record.notes = merged.notes;
    if (input.apiKey?.trim()) {
      record.encryptedApiKey = await encrypt(input.apiKey.trim());
      record.apiKeyMasked = maskKey(input.apiKey.trim());
    }
    if (!record.enabled)
      for (const workflow of ["tryon", "pose", "recolor", "qc", "research", "assistant"] as const) {
        if (store.workflowModelBindings[workflow].primary?.providerId === id)
          delete store.workflowModelBindings[workflow].primary;
        if (store.workflowModelBindings[workflow].fallback?.providerId === id)
          delete store.workflowModelBindings[workflow].fallback;
      }
    record.updatedAt = new Date().toISOString();
    record.lastTestStatus = "untested";
    record.lastTestAt = undefined;
    record.lastError = undefined;
    record.lastImageTestStatus = "untested";
    record.lastImageTestAt = undefined;
    record.lastImageTestError = undefined;
    return publicProvider(record);
  });
}
export async function deleteApiProvider(id: string) {
  return mutate((store) => {
    const exists = store.apiProviders.some((item) => item.id === id);
    if (!exists) throw new Error("API 提供商不存在");
    store.apiProviders = store.apiProviders.filter((item) => item.id !== id);
    for (const workflow of ["product", "tryon", "pose", "recolor", "qc", "research", "assistant", "correction", "prompt-optimize"] as const) {
      const binding = store.workflowModelBindings[workflow];
      if (binding.primary?.providerId === id) delete binding.primary;
      if (binding.fallback?.providerId === id) delete binding.fallback;
    }
    return true;
  });
}
export async function updateProviderTestResult(
  id: string,
  kind: "connection" | "image",
  status: ProviderTestStatus,
  error?: string,
) {
  return mutate((store) => {
    const record = store.apiProviders.find((item) => item.id === id);
    if (!record) throw new Error("API 提供商不存在");
    const now = new Date().toISOString();
    if (kind === "connection") {
      record.lastTestStatus = status;
      record.lastTestAt = now;
      record.lastError = error;
    } else {
      record.lastImageTestStatus = status;
      record.lastImageTestAt = now;
      record.lastImageTestError = error;
    }
    record.updatedAt = now;
    return publicProvider(record);
  });
}

export const SYC_DEFAULTS = {
  name: "默认",
  baseUrl: "https://sycagent.top/v1",
  imageModel: "gpt-image-2",
  visionModel: "",
  chatModel: "",
  stream: false,
  partialImages: 1,
  returnBase64: true,
  codexCliCompatible: false,
  timeoutSeconds: 600,
  enabled: true,
} as const;

function sycPublic(record?: ApiProviderSecretRecord): SycConfigPublic {
  const hasKey = Boolean(record?.encryptedApiKey),
    hasModel = Boolean(record?.imageModel || record?.defaultModel);
  return {
    id: record?.id || "syc-default",
    name: record?.name || SYC_DEFAULTS.name,
    providerType: "syc-openai-compatible",
    baseUrl: record?.baseUrl || SYC_DEFAULTS.baseUrl,
    apiKeyConfigured: hasKey,
    apiKeyMask: record?.apiKeyMasked
      ? `••••••••${record.apiKeyMasked.slice(-4)}`
      : "",
    imageModel:
      record?.imageModel || record?.defaultModel || SYC_DEFAULTS.imageModel,
    visionModel: record?.visionModel || SYC_DEFAULTS.visionModel,
    chatModel: record?.chatModel || SYC_DEFAULTS.chatModel,
    stream: record?.stream ?? SYC_DEFAULTS.stream,
    partialImages: record?.partialImages ?? SYC_DEFAULTS.partialImages,
    returnBase64: record?.returnBase64 ?? SYC_DEFAULTS.returnBase64,
    codexCliCompatible:
      record?.codexCliCompatible ?? SYC_DEFAULTS.codexCliCompatible,
    timeoutSeconds: record?.timeoutSeconds ?? SYC_DEFAULTS.timeoutSeconds,
    enabled: record?.enabled ?? SYC_DEFAULTS.enabled,
    lastTestStatus:
      record?.lastTestStatus ||
      (hasKey && hasModel ? "untested" : "incomplete"),
    lastTestAt: record?.lastTestAt,
    lastError: record?.lastError,
    lastImageTestStatus: record?.lastImageTestStatus || "untested",
    lastImageTestAt: record?.lastImageTestAt,
    lastImageTestError: record?.lastImageTestError,
    lastTestLatencyMs: record?.lastTestLatencyMs,
  };
}

export async function getSycConfig() {
  return sycPublic(
    (await loadStore()).apiProviders.find(
      (item) => item.type === "syc-openai-compatible",
    ),
  );
}

function validateSycInput(input: SycConfigInput, requireKey: boolean) {
  if (!input.name.trim()) throw new Error("配置名称不能为空");
  if (requireKey && !input.apiKey?.trim())
    throw new Error("SYC 授权码 / API Key 不能为空");
  if (!input.imageModel.trim()) throw new Error("图片模型不能为空");
  if (input.partialImages < 0 || input.partialImages > 3)
    throw new Error("中间步骤图像数必须在 0 到 3 之间");
  if (input.timeoutSeconds < 10 || input.timeoutSeconds > 900)
    throw new Error("请求超时必须在 10 到 900 秒之间");
  return {
    ...input,
    name: input.name.trim(),
    baseUrl: normalizeSycBaseUrl(input.baseUrl),
    imageModel: input.imageModel.trim(),
    visionModel: input.visionModel?.trim() || "",
    chatModel: input.chatModel?.trim() || "",
    apiKey: input.apiKey?.trim(),
  };
}

export async function saveSycConfig(input: SycConfigInput) {
  return mutate(async (store) => {
    let record = store.apiProviders.find(
      (item) => item.type === "syc-openai-compatible",
    );
    const value = validateSycInput(input, !record?.encryptedApiKey);
    const now = new Date().toISOString(),
      keyChanged = Boolean(value.apiKey),
      connectionChanged =
        !record ||
        record.baseUrl !== value.baseUrl ||
        keyChanged ||
        record.imageModel !== value.imageModel;
    if (!record) {
      const key = value.apiKey!;
      record = {
        id: crypto.randomUUID(),
        name: value.name,
        type: "syc-openai-compatible",
        baseUrl: value.baseUrl,
        encryptedApiKey: await encrypt(key),
        apiKeyMasked: maskKey(key),
        defaultModel: value.imageModel,
        enabled: value.enabled,
        notes: "SYC 中转站专用配置",
        lastTestStatus: "untested",
        createdAt: now,
        updatedAt: now,
      };
      store.apiProviders.push(record);
    } else {
      record.name = value.name;
      record.baseUrl = value.baseUrl;
      record.defaultModel = value.imageModel;
      record.enabled = value.enabled;
      if (value.apiKey) {
        record.encryptedApiKey = await encrypt(value.apiKey);
        record.apiKeyMasked = maskKey(value.apiKey);
      }
      record.updatedAt = now;
    }
    record.imageModel = value.imageModel;
    record.visionModel = value.visionModel;
    record.chatModel = value.chatModel;
    record.stream = value.stream;
    record.partialImages = value.partialImages;
    record.returnBase64 = value.returnBase64;
    record.codexCliCompatible = value.codexCliCompatible;
    record.timeoutSeconds = value.timeoutSeconds;

    if (connectionChanged) {
      record.lastTestStatus = "untested";
      record.lastTestAt = undefined;
      record.lastError = undefined;
      record.lastImageTestStatus = "untested";
      record.lastImageTestAt = undefined;
      record.lastImageTestError = undefined;
      record.lastTestLatencyMs = undefined;
    }
    if (!record.enabled)
      for (const workflow of ["tryon", "pose", "recolor", "qc", "research", "assistant"] as const) {
        if (
          store.workflowModelBindings[workflow].primary?.providerId ===
          record.id
        )
          delete store.workflowModelBindings[workflow].primary;
        if (
          store.workflowModelBindings[workflow].fallback?.providerId ===
          record.id
        )
          delete store.workflowModelBindings[workflow].fallback;
      }
    return sycPublic(record);
  });
}

export async function deleteSycConfig() {
  const current = await getSycConfig();
  if (current.id === "syc-default") return false;
  return deleteApiProvider(current.id);
}

export async function getSycRuntime(draft?: {
  baseUrl?: string;
  apiKey?: string;
  imageModel?: string;
}) {
  const record = (await loadStore()).apiProviders.find(
    (item) => item.type === "syc-openai-compatible",
  );
  const baseUrl = normalizeSycBaseUrl(
    draft?.baseUrl || record?.baseUrl || SYC_DEFAULTS.baseUrl,
  );
  const apiKey =
    draft?.apiKey?.trim() ||
    (record?.encryptedApiKey ? await decrypt(record.encryptedApiKey) : "");
  if (!apiKey) throw new Error("SYC 授权码 / API Key 尚未配置");
  return {
    id: record?.id || "syc-default",
    name: record?.name || SYC_DEFAULTS.name,
    type: "syc-openai-compatible" as const,
    baseUrl,
    apiKey,
    model:
      draft?.imageModel?.trim() ||
      record?.imageModel ||
      record?.defaultModel ||
      SYC_DEFAULTS.imageModel,
    source: "stored" as const,
    syc: {
      stream: record?.stream ?? SYC_DEFAULTS.stream,
      partialImages: record?.partialImages ?? SYC_DEFAULTS.partialImages,
      returnBase64: record?.returnBase64 ?? SYC_DEFAULTS.returnBase64,
      codexCliCompatible:
        record?.codexCliCompatible ?? SYC_DEFAULTS.codexCliCompatible,
      timeoutSeconds: record?.timeoutSeconds ?? SYC_DEFAULTS.timeoutSeconds,
    },
  };
}

export async function getSycChatRuntime() {
  const record = (await loadStore()).apiProviders.find(
    (item) => item.type === "syc-openai-compatible",
  );
  if (!record?.enabled) throw new Error("请先启用 SYC 中转站配置");
  const apiKey = record.encryptedApiKey
    ? await decrypt(record.encryptedApiKey)
    : "";
  if (!apiKey) throw new Error("SYC 授权码 / API Key 尚未配置");
  const model = record.chatModel?.trim();
  if (!model)
    throw new Error("请先在 SYC 中转站配置对话模型，用于产品图片识别");
  return {
    baseUrl: normalizeSycBaseUrl(record.baseUrl),
    apiKey,
    model,
    timeoutSeconds: record.timeoutSeconds ?? SYC_DEFAULTS.timeoutSeconds,
  };
}

export async function updateSycTestResult(
  kind: "connection" | "image",
  status: SycTestStatus,
  error?: string,
  latencyMs?: number,
) {
  return mutate((store) => {
    const record = store.apiProviders.find(
      (item) => item.type === "syc-openai-compatible",
    );
    if (!record) throw new Error("请先保存 SYC 配置");
    const now = new Date().toISOString();
    if (kind === "connection") {
      record.lastTestStatus = status as ProviderTestStatus;
      record.lastTestAt = now;
      record.lastError = error;
      record.lastTestLatencyMs = latencyMs;
    } else {
      record.lastImageTestStatus = status;
      record.lastImageTestAt = now;
      record.lastImageTestError = error;
    }
    record.updatedAt = now;
    return sycPublic(record);
  });
}
function validSelection(value: unknown): WorkflowModelSelection | undefined {
  if (!value || typeof value !== "object") return;
  const item = value as Partial<WorkflowModelSelection>;
  if (!item.providerId?.trim() || !item.model?.trim()) return;
  return { providerId: item.providerId.trim(), model: item.model.trim() };
}
function looksLikeImageGenerationModel(model: string) {
  return /(?:gpt[-_.]?image|seedream|flux|fashn|virtual[-_.]?try[-_.]?on|dall[-_.]?e|imagen|midjourney|stable[-_.]?diffusion)/i.test(
    model,
  );
}
function normalizedWorkflowBindings(store: SettingsStore) {
  const bindings = cleanBindings(store.workflowModelBindings);
  const productPrimary = validSelection(bindings.product.primary);

  // Migrate configurations created before product recognition had its own
  // vision-model slot. Those versions copied the image generation model into
  // the product workflow and would keep showing an error after upgrading.
  if (
    productPrimary &&
    looksLikeImageGenerationModel(productPrimary.model)
  )
    delete bindings.product.primary;

  return bindings;
}
export async function getWorkflowModelBindings() {
  return normalizedWorkflowBindings(await loadStore());
}
export async function saveWorkflowModelBindings(
  input: Partial<WorkflowModelBindings>,
) {
  return mutate((store) => {
    const providers = store.apiProviders.filter((item) => item.enabled);
    const providerIds = new Set(providers.map((item) => item.id));
    const next = cleanBindings(input);
    const workflows = [
      "product",
      "tryon",
      "pose",
      "recolor",
      "qc",
      "research",
      "assistant",
      "correction",
      "prompt-optimize",
    ] as const;
    for (const workflow of workflows) {
      for (const slot of ["primary", "fallback"] as const) {
        const selection = validSelection(next[workflow][slot]);
        if (!selection) {
          delete next[workflow][slot];
          continue;
        }
        if (!providerIds.has(selection.providerId))
          throw new Error(
            `${workflow} 的${slot === "primary" ? "主" : "备用"}提供商不存在或未启用`,
          );
        if (
          workflow === "product" &&
          slot === "primary" &&
          looksLikeImageGenerationModel(selection.model)
        )
          throw new Error(
            `产品识别模型“${selection.model}”是图片生成模型，请填写支持图片输入和文字输出的视觉理解模型 ID`,
          );
        // 能力校验：模型必须满足工作流所需能力，否则拒绝保存
        const provider = providers.find((item) => item.id === selection.providerId);
        if (provider) {
          const capabilities = inferCapabilities(provider.type, selection.model);
          const required = WORKFLOW_REQUIRED_CAPABILITIES[workflow];
          if (required.length && !capabilitiesMatch(capabilities, required)) {
            const missing = missingCapabilities(capabilities, required)
              .map((capability) => CAPABILITY_LABELS[capability])
              .join("、");
            throw new Error(
              `模型“${selection.model}”缺少当前工作流所需能力：${missing}，不能用于${slot === "primary" ? "主" : "备用"}模型`,
            );
          }
        }
        next[workflow][slot] = selection;
      }
    }
    store.workflowModelBindings = next;
    return cleanBindings(next);
  });
}

export async function getProviderRuntime(
  id: string,
  model?: string,
): Promise<ProviderRuntimeConfig> {
  const record = (await loadStore()).apiProviders.find(
    (item) => item.id === id,
  );
  if (!record) throw new Error("绑定的 API 提供商不存在");
  if (!record.enabled) throw new Error(`API 提供商“${record.name}”未启用`);
  const selectedModel = model?.trim() || record.defaultModel;
  if (!selectedModel)
    throw new Error(`API 提供商“${record.name}”没有配置模型名称`);
  if (!record.baseUrl)
    throw new Error(`API 提供商“${record.name}”没有配置 Base URL`);
  if (!record.encryptedApiKey)
    throw new Error(`API 提供商“${record.name}”没有配置 API Key`);
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    baseUrl: record.baseUrl,
    apiKey: await decrypt(record.encryptedApiKey),
    model: selectedModel,
    source: "stored",
    ...(record.type === "syc-openai-compatible"
      ? {
          syc: {
            stream: record.stream ?? false,
            partialImages: record.partialImages ?? 1,
            returnBase64: record.returnBase64 ?? true,
            codexCliCompatible: record.codexCliCompatible ?? false,
            timeoutSeconds: record.timeoutSeconds ?? 600,
          },
        }
      : {}),
  };
}

function environmentRuntime(
  workflow: WorkflowType,
  mode: GenerationMode,
): ProviderRuntimeConfig {
  const choice = getModel(workflow, mode),
    type = choice.provider as ApiProviderType;
  const map: Record<string, { name: string; baseUrl: string; apiKey: string }> =
    {
      bfl: {
        name: "BFL",
        baseUrl: process.env.BFL_API_BASE_URL || "https://api.bfl.ai",
        apiKey: process.env.BFL_API_KEY || "",
      },
      fashn: {
        name: "FASHN",
        baseUrl: process.env.FASHN_API_BASE_URL || "https://api.fashn.ai/v1",
        apiKey: process.env.FASHN_API_KEY || "",
      },
      volcengine: {
        name: "火山方舟",
        baseUrl:
          process.env.VOLCENGINE_API_BASE_URL ||
          "https://ark.cn-beijing.volces.com/api/v3",
        apiKey: process.env.VOLCENGINE_API_KEY || "",
      },
      flux: {
        name: "FLUX",
        baseUrl: process.env.FLUX_API_BASE_URL || "",
        apiKey: process.env.FLUX_API_KEY || "",
      },
      custom: {
        name: "自定义图像 API",
        baseUrl: process.env.CUSTOM_IMAGE_API_ENDPOINT || "",
        apiKey: process.env.CUSTOM_IMAGE_API_KEY || "",
      },
    };
  const item = map[choice.provider];
  if (!item?.apiKey)
    throw new Error(`${item?.name || choice.provider} API Key 未配置`);
  if (!item.baseUrl) throw new Error(`${item.name} Base URL 未配置`);
  return {
    id: `environment:${choice.provider}`,
    name: item.name,
    type,
    baseUrl: item.baseUrl,
    apiKey: item.apiKey,
    model: choice.model,
    source: "environment",
  };
}
export async function resolveWorkflowModel(
  workflow: WorkflowType,
  mode: GenerationMode,
  slot: ModelSlot = "primary",
) {
  const bindings = await getWorkflowModelBindings(),
    selection = bindings[workflow][slot];
  if (selection)
    return getProviderRuntime(selection.providerId, selection.model);
  if (slot === "fallback")
    throw new Error(
      `${workflow === "tryon" ? "服装换装" : workflow === "pose" ? "三种姿势" : "服装复色"}尚未配置备用模型`,
    );
  return environmentRuntime(workflow, mode);
}

export async function resolveProductAnalysisModel(slot: ModelSlot = "primary") {
  const selection = (await getWorkflowModelBindings()).product[slot];
  if (selection) {
    if (slot === "primary" && looksLikeImageGenerationModel(selection.model))
      throw new Error(
        `当前产品识别绑定了图片生成模型“${selection.model}”。产品识别需要支持图片输入和文字输出的视觉理解模型，请到工作流模型分配中修改模型 ID`,
      );
    return getProviderRuntime(selection.providerId, selection.model);
  }
  // 环境变量兜底：未在工作台存储中绑定时，读取服务器 .env.local 中的视觉识别模型配置
  const vision = environmentVisionRuntime();
  if (vision) return vision;
  throw new Error(
    slot === "fallback"
      ? "产品识别尚未配置对话模型，请到“API与模型设置 → 工作流模型分配”中选择"
      : "产品识别尚未配置图片识别模型，请到“API与模型设置 → 工作流模型分配”中选择",
  );
}

/** 服务器环境变量配置的视觉识别模型（用于产品识别 / QC 等看图工作流兜底）。 */
function environmentVisionRuntime(): ProviderRuntimeConfig | null {
  const baseUrl = process.env.VISION_API_BASE_URL?.trim();
  const apiKey = process.env.VISION_API_KEY?.trim();
  const model = process.env.VISION_MODEL?.trim();
  if (!baseUrl && !apiKey && !model) return null;
  if (!baseUrl || !apiKey || !model)
    throw new Error(
      "视觉识别环境变量不完整：请同时配置 VISION_API_BASE_URL、VISION_API_KEY、VISION_MODEL",
    );
  return {
    id: "environment:vision",
    name: "视觉识别模型（环境变量）",
    type: "openai-compatible",
    baseUrl,
    apiKey,
    model,
    source: "environment",
  };
}

/**
 * QC 质量检查视觉模型。独立槽位，可单独更换；未配置时回退到产品视觉识别模型。
 */
export async function resolveQcModel(slot: ModelSlot = "primary") {
  const bindings = await getWorkflowModelBindings();
  const selection = bindings.qc[slot];
  if (selection) return getProviderRuntime(selection.providerId, selection.model);
  if (slot === "fallback")
    throw new Error("QC质量检查尚未配置备用视觉模型，请到“API与模型设置 → 工作流模型分配”中选择");
  // 回退到产品视觉识别模型，保证老配置开箱即用
  return resolveProductAnalysisModel("primary");
}

export async function resolveTextModel(workflow: "research" | "assistant", slot: ModelSlot = "primary") {
  const selection = (await getWorkflowModelBindings())[workflow][slot];
  if (selection) return getProviderRuntime(selection.providerId, selection.model);
  throw new Error(
    slot === "fallback"
      ? `${workflow === "research" ? "爆款研究" : "工作台AI助手"}尚未配置备用文本模型`
      : `${workflow === "research" ? "爆款研究" : "工作台AI助手"}尚未配置文本模型，请到“API与模型设置 → 工作流模型分配”中选择`,
  );
}

/** 咒语矫正模型：把用户口语化的修改要求改写成严格按方向的精确修改指令。 */
export async function resolveCorrectionModel(slot: ModelSlot = "primary") {
  const selection = (await getWorkflowModelBindings()).correction[slot];
  if (selection) return getProviderRuntime(selection.providerId, selection.model);
  throw new Error(
    slot === "fallback"
      ? "咒语矫正尚未配置备用文本模型，请到“API与模型设置 → 工作流模型分配”中选择"
      : "咒语矫正尚未配置文本模型，请到“API与模型设置 → 工作流模型分配”中选择 DeepSeek 等文本模型",
  );
}

/** Prompt 优化模型：把简单中文咒语整理成结构化高质量 Prompt，再交给图片模型执行。 */
export async function resolvePromptOptimizeModel(slot: ModelSlot = "primary") {
  const selection = (await getWorkflowModelBindings())["prompt-optimize"][slot];
  if (selection) return getProviderRuntime(selection.providerId, selection.model);
  throw new Error(
    slot === "fallback"
      ? "Prompt优化尚未配置备用文本模型，请到“API与模型设置 → 工作流模型分配”中选择"
      : "Prompt优化尚未配置文本模型，请到“API与模型设置 → 工作流模型分配”中选择 DeepSeek 等文本模型",
  );
}

async function runtimeSummary(
  workflow: ModelWorkflowType,
  slot: ModelSlot,
): Promise<WorkflowRuntimeModel> {
  try {
    const bindings = await getWorkflowModelBindings(),
      selection = bindings[workflow][slot];
    if (slot === "fallback" && !selection)
      return {
        slot,
        configured: false,
        providerName: "未配置",
        providerType: "",
        model: "",
        source: "none",
      };
    const runtime =
      workflow === "product"
        ? await resolveProductAnalysisModel(slot)
        : workflow === "qc"
          ? await resolveQcModel(slot)
          : workflow === "correction"
            ? await resolveCorrectionModel(slot)
            : workflow === "prompt-optimize"
              ? await resolvePromptOptimizeModel(slot)
              : workflow === "research" || workflow === "assistant"
                ? await resolveTextModel(workflow, slot)
                : await resolveWorkflowModel(workflow, "standard", slot);
    return {
      slot,
      configured: true,
      providerId: runtime.id,
      providerName: runtime.name,
      providerType: runtime.type,
      model: runtime.model,
      source: runtime.source,
    };
  } catch (error) {
    return {
      slot,
      configured: false,
      providerName: "未配置",
      providerType: "",
      model: "",
      source: "none",
      error: error instanceof Error ? error.message : "模型配置不可用",
    };
  }
}
export async function getWorkflowRuntimeSummary(): Promise<WorkflowRuntimeSummary> {
  const entries = await Promise.all(
    (["product", "tryon", "pose", "recolor", "qc", "research", "assistant", "correction", "prompt-optimize"] as const).map(
      async (workflow) =>
        [
          workflow,
          {
            primary: await runtimeSummary(workflow, "primary"),
            fallback: await runtimeSummary(workflow, "fallback"),
          },
        ] as const,
    ),
  );
  return Object.fromEntries(entries) as WorkflowRuntimeSummary;
}
