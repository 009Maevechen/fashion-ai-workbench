import path from "node:path";

function resolveRuntimeDirectory(value:string|undefined,fallback:string){
  const selected=value?.trim();
  return selected?path.resolve(selected):path.resolve(process.cwd(),fallback);
}

/**
 * 桌面安装版会由 Electron 注入绝对目录；网页开发版继续使用仓库内的 data/ 与 outputs/。
 */
export const runtimeDataDir=()=>resolveRuntimeDirectory(process.env.AI_STUDIO_DATA_DIR,"data");
export const runtimeOutputsDir=()=>resolveRuntimeDirectory(process.env.AI_STUDIO_OUTPUTS_DIR||process.env.OUTPUTS_DIR,"outputs");
