import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { durableWriteJson, readValidJson } from "./durable-json";
import { runtimeDataDir } from "./runtime-paths";

export type SpreadsheetImportRowResult = {
  rowNumber: number;
  sku?: string;
  projectId?: string;
  taskId?: string;
  status: "created" | "updated" | "skipped" | "failed";
  issues: string[];
};

export type SpreadsheetImportRecord = {
  id: string;
  fileName: string;
  sheetName: string;
  fileHash: string;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  status: "completed" | "partial" | "failed";
  importedAt: string;
  rows: SpreadsheetImportRowResult[];
};

type Store = { schemaVersion: 1; imports: SpreadsheetImportRecord[] };
const file = path.join(runtimeDataDir(), "spreadsheet-imports.json");
let queue = Promise.resolve();

function isStore(value: unknown): value is Store {
  return Boolean(value && Array.isArray((value as Partial<Store>).imports));
}
async function load(): Promise<Store> {
  try {
    return await readValidJson(file, isStore);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, imports: [] };
    throw error;
  }
}
async function save(store: Store) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await durableWriteJson(file, store);
}
export async function listSpreadsheetImports() {
  return [...(await load()).imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}
export async function getSpreadsheetImport(id: string) {
  return (await load()).imports.find((item) => item.id === id);
}
export function createImportIdentity(fileName: string, buffer: Buffer) {
  return { id: crypto.randomUUID(), fileName, fileHash: crypto.createHash("sha256").update(buffer).digest("hex"), importedAt: new Date().toISOString() };
}
export async function addSpreadsheetImport(record: SpreadsheetImportRecord) {
  queue = queue.then(async () => {
    const store = await load();
    store.imports.push(record);
    await save(store);
  });
  await queue;
  return record;
}
