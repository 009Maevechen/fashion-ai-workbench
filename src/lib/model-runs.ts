import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runtimeDataDir } from "./runtime-paths";
import type { ModelRunRecord } from "./ai/provider-settings-types";

/**
 * 模型任务运行记录：为模型实验室（哪个模型最快/成功率最高/QC通过率最高）
 * 和 Prompt 版本库（不同 Prompt 的 QC 通过率）预留的数据结构。
 * 本轮只记录，不做统计大屏。不保存任何 API Key。
 */
const dataDir = runtimeDataDir();
const recordsFile = path.join(dataDir, "model-runs.jsonl");
let queue = Promise.resolve();

function sanitizeRecord(record: ModelRunRecord): ModelRunRecord {
  return {
    ...record,
    errorMessage: record.errorMessage?.slice(0, 500),
    parameters: record.parameters || {},
  };
}

export async function appendModelRunRecord(record: Omit<ModelRunRecord, "id">): Promise<ModelRunRecord> {
  const full: ModelRunRecord = { ...record, id: crypto.randomUUID() };
  const safe = sanitizeRecord(full);
  queue = queue.then(async () => {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.appendFile(recordsFile, `${JSON.stringify(safe)}\n`, { mode: 0o600 });
  });
  await queue;
  return safe;
}

export async function listModelRunRecords(limit = 500): Promise<ModelRunRecord[]> {
  try {
    const content = await fs.readFile(recordsFile, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as ModelRunRecord;
        } catch {
          return undefined;
        }
      })
      .filter((item): item is ModelRunRecord => Boolean(item));
  } catch {
    return [];
  }
}

/** 为 Prompt 版本库预留：读取已记录的 promptTemplateId / promptVersion 组合。 */
export async function listPromptVersions(): Promise<
  Array<{ promptTemplateId: string; promptVersion: string; count: number }>
> {
  const records = await listModelRunRecords(5000);
  const map = new Map<string, { promptTemplateId: string; promptVersion: string; count: number }>();
  for (const record of records) {
    if (!record.promptTemplateId || !record.promptVersion) continue;
    const key = `${record.promptTemplateId}::${record.promptVersion}`;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { promptTemplateId: record.promptTemplateId, promptVersion: record.promptVersion, count: 1 });
  }
  return [...map.values()];
}
