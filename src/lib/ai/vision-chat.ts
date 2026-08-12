import "server-only";
import type { ProviderRuntimeConfig } from "./provider-settings-types";

export function visionChatEndpoint(baseUrl: string) {
  const url = new URL(baseUrl);
  url.pathname = url.pathname
    .replace(/\/images\/(?:generations|edits)\/?$/i, "")
    .replace(/\/chat\/completions\/?$/i, "")
    .replace(/\/$/, "");
  url.pathname = `${url.pathname}/chat/completions`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function visionResponsesEndpoint(baseUrl: string) {
  const url = new URL(baseUrl);
  url.pathname = url.pathname
    .replace(/\/images\/(?:generations|edits)\/?$/i, "")
    .replace(/\/(?:chat\/completions|responses)\/?$/i, "")
    .replace(/\/$/, "");
  url.pathname = `${url.pathname}/responses`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

type ApiError = { error?: { message?: string } | string; message?: string };

async function providerFetch(
  url: string,
  init: RequestInit,
  model: string,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      // A failed upstream connection can poison or abort its request signal.
      // Give every retry a fresh timeout signal and connection attempt.
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3)
        await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  const detail =
    lastError instanceof Error && lastError.cause instanceof Error
      ? lastError.cause.message
      : lastError instanceof Error
        ? lastError.message
        : "未知网络错误";
  throw new Error(
    `无法连接模型服务（${model}）：${detail}。已自动重试 3 次，请检查 Base URL、本机网络或中转站状态`,
  );
}

function errorDetail(data: ApiError, status: number) {
  return (
    (typeof data.error === "string" ? data.error : data.error?.message) ||
    data.message ||
    `HTTP ${status}`
  );
}

function parseJsonText(content: string) {
  let candidate = content
    .replace(/^\uFEFF/, "")
    .match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || content;
  candidate = candidate.trim();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (typeof parsed === "string") {
        candidate = parsed.trim();
        continue;
      }
      return parsed;
    } catch {
      const objectStart = candidate.indexOf("{");
      const objectEnd = candidate.lastIndexOf("}");
      const arrayStart = candidate.indexOf("[");
      const arrayEnd = candidate.lastIndexOf("]");
      const useArray =
        arrayStart >= 0 &&
        arrayEnd > arrayStart &&
        (objectStart < 0 || arrayStart < objectStart);
      const start = useArray ? arrayStart : objectStart;
      const end = useArray ? arrayEnd : objectEnd;
      if (start < 0 || end <= start) break;
      candidate = candidate.slice(start, end + 1);
    }
  }
  throw new Error("识别模型没有返回有效 JSON");
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return value.map(textFromUnknown).join("");
  const record = value as Record<string, unknown>;
  for (const key of ["output_text", "text", "content", "value"]) {
    const text = textFromUnknown(record[key]);
    if (text) return text;
  }
  return "";
}

async function requestChatText(
  runtime: ProviderRuntimeConfig,
  messages: unknown[],
) {
  const response = await providerFetch(visionChatEndpoint(runtime.baseUrl), {
    method: "POST",
    signal: AbortSignal.timeout((runtime.syc?.timeoutSeconds || 600) * 1000),
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: runtime.model, temperature: 0, messages }),
  }, runtime.model);
  const data = (await response.json().catch(() => ({}))) as ApiError & {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  if (!response.ok) throw new Error(errorDetail(data, response.status));
  const content = textFromUnknown(data.choices?.[0]?.message?.content);
  if (!content) throw new Error("模型没有返回可读取文字");
  return content;
}

export async function requestVisionText(
  runtime: ProviderRuntimeConfig,
  imageDataUrl: string,
  system: string,
  prompt: string,
) {
  return requestChatText(runtime, [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    },
  ]);
}

export async function requestTextJson(
  runtime: ProviderRuntimeConfig,
  system: string,
  prompt: string,
) {
  const content = await requestChatText(runtime, [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ]);
  return parseJsonText(content);
}

function shouldTryResponses(status: number, detail: string) {
  return (
    status === 404 ||
    status === 405 ||
    /not supported on the chat completions endpoint|use (?:the )?responses api|unsupported.*chat|chat completions.*not supported/i.test(
      detail,
    )
  );
}

async function requestResponses(
  runtime: ProviderRuntimeConfig,
  imageDataUrl: string,
  system: string,
  prompt: string,
  retried = false,
) {
  const response = await providerFetch(visionResponsesEndpoint(runtime.baseUrl), {
    method: "POST",
    signal: AbortSignal.timeout((runtime.syc?.timeoutSeconds || 600) * 1000),
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: runtime.model,
      instructions: system,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageDataUrl },
          ],
        },
      ],
      text: { format: { type: "json_object" } },
    }),
  }, runtime.model);
  const data = (await response.json().catch(() => ({}))) as ApiError & {
    output_text?: string;
    output?: Array<{
      content?: Array<{ text?: string; type?: string }>;
    }>;
  };
  if (!response.ok) {
    const detail = errorDetail(data, response.status);
    if (/model.*not supported|unsupported model|does not support.*image/i.test(detail))
      throw new Error(
        `模型“${runtime.model}”不支持图片识别，请在“产品识别模型”中选择支持图片理解的模型`,
      );
    throw new Error(detail);
  }
  const content = data.output_text || textFromUnknown(data.output);
  if (!content) throw new Error("识别模型没有返回可读取内容");
  try {
    return parseJsonText(content);
  } catch (error) {
    if (!retried)
      return requestResponses(
        runtime,
        imageDataUrl,
        `${system} 不得解释、不得使用 Markdown。`,
        `${prompt}\n重要：只输出一个合法 JSON 对象，以 { 开始、以 } 结束，不能输出任何其他文字。`,
        true,
      );
    throw error;
  }
}

export async function requestVisionJson(
  runtime: ProviderRuntimeConfig,
  imageDataUrl: string,
  system: string,
  prompt: string,
  retried = false,
) {
  const response = await fetch(visionChatEndpoint(runtime.baseUrl), {
    method: "POST",
    signal: AbortSignal.timeout((runtime.syc?.timeoutSeconds || 600) * 1000),
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: runtime.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    error?: { message?: string } | string;
    message?: string;
  };
  if (!response.ok) {
    const detail = errorDetail(data, response.status);
    if (shouldTryResponses(response.status, detail))
      return requestResponses(runtime, imageDataUrl, system, prompt);
    throw new Error(detail);
  }
  const content = textFromUnknown(data.choices?.[0]?.message?.content);
  if (!content) throw new Error("识别模型没有返回可读取内容");
  try {
    return parseJsonText(content);
  } catch (error) {
    if (!retried)
      return requestVisionJson(
        runtime,
        imageDataUrl,
        `${system} 不得解释、不得使用 Markdown。`,
        `${prompt}\n重要：只输出一个合法 JSON 对象，以 { 开始、以 } 结束，不能输出任何其他文字。`,
        true,
      );
    throw error;
  }
}
