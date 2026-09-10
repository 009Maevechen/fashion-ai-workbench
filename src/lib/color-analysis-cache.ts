import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runtimeDataDir } from "./runtime-paths";

const CACHE_VERSION = "color-analysis-v2";
const cacheDir = () => path.join(runtimeDataDir(), "color-analysis-cache");

export function colorAnalysisCacheKey(
  reference: Buffer,
  baseStyle?: Buffer,
) {
  const hash = crypto.createHash("sha256");
  hash.update(CACHE_VERSION);
  hash.update(reference);
  if (baseStyle) hash.update(baseStyle);
  return hash.digest("hex");
}

export async function getCachedColorAnalysis<T>(key: string) {
  try {
    const parsed = JSON.parse(
      await fs.readFile(path.join(cacheDir(), `${key}.json`), "utf8"),
    ) as { version?: string; result?: T };
    return parsed.version === CACHE_VERSION ? parsed.result : undefined;
  } catch {
    return undefined;
  }
}

export async function putCachedColorAnalysis<T>(key: string, result: T) {
  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    const target = path.join(cacheDir(), `${key}.json`);
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(
      temporary,
      JSON.stringify({ version: CACHE_VERSION, cachedAt: new Date().toISOString(), result }),
    );
    await fs.rename(temporary, target);
  } catch {
    // 缓存失败不能阻断真实颜色识别。
  }
}
