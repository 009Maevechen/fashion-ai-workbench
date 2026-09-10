import "server-only";
import sharp from "sharp";
import { z } from "zod";
import type { ProviderRuntimeConfig } from "./provider-settings-types";
import { requestVisionJson } from "./vision-chat";
import { toDataUrl } from "./storage";

const resultSchema = z.object({
  imageReceived: z.literal(true),
  dominantColor: z.enum(["red", "green", "blue"]),
});

const samples = [
  { dominantColor: "red" as const, background: { r: 222, g: 36, b: 48, alpha: 1 } },
  { dominantColor: "green" as const, background: { r: 24, g: 166, b: 81, alpha: 1 } },
  { dominantColor: "blue" as const, background: { r: 37, g: 92, b: 220, alpha: 1 } },
];

function safeError(error: unknown, apiKey: string) {
  const source = error instanceof Error ? error.message : "视觉模型测试失败";
  return source
    .replaceAll(apiKey, "[API_KEY_REDACTED]")
    .replace(/(authorization|bearer|api[_ -]?key)\s*[:=]?\s*[^\s,;]+/gi, "$1=[REDACTED]");
}

/**
 * 真正发送一张随机纯色图片，验证 Base URL、密钥、模型名、图片输入和 JSON 输出。
 * 测试图每次随机选择颜色，避免只返回固定文本也能误判为成功。
 */
export async function testVisionRuntime(runtime: ProviderRuntimeConfig) {
  if (!runtime.baseUrl.trim()) throw new Error("视觉模型 Base URL 尚未配置");
  if (!runtime.apiKey.trim()) throw new Error("视觉模型 API Key 尚未配置");
  if (!runtime.model.trim()) throw new Error("视觉模型名称尚未配置");
  if (["deepseek", "bfl", "fashn"].includes(runtime.type))
    throw new Error("当前提供商不支持带图片的视觉理解请求");

  const sample = samples[Math.floor(Math.random() * samples.length)];
  const image = await sharp({
    create: { width: 96, height: 96, channels: 4, background: sample.background },
  })
    .png()
    .toBuffer();
  const started = Date.now();
  try {
    const parsed = resultSchema.parse(
      await requestVisionJson(
        runtime,
        toDataUrl(image, "image/png"),
        "你是视觉连接测试助手。必须读取用户附带的实际图片，只输出合法 JSON。",
        '识别图片中的主色。只允许返回：{"imageReceived":true,"dominantColor":"red|green|blue"}。dominantColor 必须是实际看到的颜色，不能猜测。',
      ),
    );
    if (parsed.dominantColor !== sample.dominantColor)
      throw new Error(
        `模型已响应，但没有正确读取测试图片（期望 ${sample.dominantColor}，实际 ${parsed.dominantColor}）`,
      );
    return {
      ok: true,
      message: "视觉模型正常",
      model: runtime.model,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    throw new Error(safeError(error, runtime.apiKey));
  }
}
