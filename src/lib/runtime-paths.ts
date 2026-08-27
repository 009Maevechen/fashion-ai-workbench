import path from "node:path";
import fs from "node:fs";

function resolveRuntimeDirectory(value: string | undefined, fallback: string) {
  const selected = value?.trim();
  return selected ? path.resolve(selected) : path.resolve(process.cwd(), fallback);
}

/**
 * 桌面安装版会由 Electron 注入绝对目录；网页开发版继续使用仓库内的 data/ 与 outputs/。
 */
export const runtimeDataDir = () => resolveRuntimeDirectory(process.env.AI_STUDIO_DATA_DIR, "data");
const storageSettingsFile = () => path.join(runtimeDataDir(), "storage-settings.json");
type StorageSettings = {
  outputsDir?: string;
  finalDir?: string;
  poseLibraryDir?: string;
  previousOutputDirs?: string[];
  previousFinalDirs?: string[];
  previousPoseLibraryDirs?: string[];
};
function storageSettings(): StorageSettings {
  try {
    return JSON.parse(fs.readFileSync(storageSettingsFile(), "utf8")) as StorageSettings;
  } catch {
    return {};
  }
}
function savedOutputsDir() {
  return storageSettings().outputsDir?.trim();
}

export const defaultRuntimeOutputsDir = () =>
  resolveRuntimeDirectory(process.env.AI_STUDIO_OUTPUTS_DIR || process.env.OUTPUTS_DIR, "outputs");
export const runtimeOutputsDir = () => resolveRuntimeDirectory(savedOutputsDir(), defaultRuntimeOutputsDir());
export const runtimeOutputSearchDirs = () => {
  const settings = storageSettings();
  return [...new Set([runtimeOutputsDir(), ...(settings.previousOutputDirs || []).map((item) => path.resolve(item))])].filter(Boolean);
};

/**
 * 最终成品目录：QC 通过且人工确认的成品图长期保存于此。
 * 未设置时回退到临时输出目录，保证网页开发版可用。
 */
export const runtimeFinalDir = () => {
  const saved = storageSettings().finalDir?.trim();
  return saved ? path.resolve(saved) : path.join(runtimeOutputsDir(), "final");
};
export const runtimeFinalSearchDirs = () => {
  const settings = storageSettings();
  return [...new Set([runtimeFinalDir(), ...(settings.previousFinalDirs || []).map((item) => path.resolve(item))])].filter(Boolean);
};

/**
 * 姿势参考库目录：长期保存的姿势参考图按商品类型分类存放。
 * 未设置时回退到临时输出目录内的 pose-library，保证兼容。
 */
export const runtimePoseLibraryDir = () => {
  const saved = storageSettings().poseLibraryDir?.trim();
  return saved ? path.resolve(saved) : path.join(runtimeOutputsDir(), "pose-library");
};
export const runtimePoseLibrarySearchDirs = () => {
  const settings = storageSettings();
  return [...new Set([runtimePoseLibraryDir(), ...(settings.previousPoseLibraryDirs || []).map((item) => path.resolve(item))])].filter(Boolean);
};

async function persistSettings(next: StorageSettings) {
  await fs.promises.mkdir(runtimeDataDir(), { recursive: true });
  const temporary = `${storageSettingsFile()}.tmp`;
  await fs.promises.writeFile(temporary, JSON.stringify(next, null, 2));
  await fs.promises.rename(temporary, storageSettingsFile());
}

async function assertWritableDir(selected: string) {
  const trimmed = selected.trim();
  if (!trimmed) throw new Error("保存位置不能为空");
  if (!path.isAbsolute(trimmed)) throw new Error("保存位置必须是完整的绝对路径");
  const resolved = path.resolve(trimmed);
  const root = path.parse(resolved).root;
  if (resolved === root) throw new Error("不能把磁盘根目录直接设为保存位置");
  await fs.promises.mkdir(resolved, { recursive: true });
  await fs.promises.access(resolved, fs.constants.R_OK | fs.constants.W_OK);
  return resolved;
}

export async function saveRuntimeOutputsDir(value: string) {
  const resolved = await assertWritableDir(value);
  const current = runtimeOutputsDir();
  const existing = storageSettings();
  const previousOutputDirs = [...new Set([...(existing.previousOutputDirs || []), current])].filter((item) => path.resolve(item) !== resolved);
  await persistSettings({ ...existing, outputsDir: resolved, previousOutputDirs });
  return resolved;
}

export async function saveRuntimeFinalDir(value: string) {
  const resolved = await assertWritableDir(value);
  const current = runtimeFinalDir();
  const existing = storageSettings();
  const previousFinalDirs = [...new Set([...(existing.previousFinalDirs || []), current])].filter((item) => path.resolve(item) !== resolved);
  await persistSettings({ ...existing, finalDir: resolved, previousFinalDirs });
  return resolved;
}

export async function saveRuntimePoseLibraryDir(value: string) {
  const resolved = await assertWritableDir(value);
  const current = runtimePoseLibraryDir();
  const existing = storageSettings();
  const previousPoseLibraryDirs = [...new Set([...(existing.previousPoseLibraryDirs || []), current])].filter((item) => path.resolve(item) !== resolved);
  await persistSettings({ ...existing, poseLibraryDir: resolved, previousPoseLibraryDirs });
  return resolved;
}

export function hasExplicitFinalDir() {
  return Boolean(storageSettings().finalDir?.trim());
}
export function hasExplicitPoseLibraryDir() {
  return Boolean(storageSettings().poseLibraryDir?.trim());
}
