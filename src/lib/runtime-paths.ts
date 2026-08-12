import path from "node:path";
import fs from "node:fs";

function resolveRuntimeDirectory(value:string|undefined,fallback:string){
  const selected=value?.trim();
  return selected?path.resolve(selected):path.resolve(process.cwd(),fallback);
}

/**
 * 桌面安装版会由 Electron 注入绝对目录；网页开发版继续使用仓库内的 data/ 与 outputs/。
 */
export const runtimeDataDir=()=>resolveRuntimeDirectory(process.env.AI_STUDIO_DATA_DIR,"data");
const storageSettingsFile=()=>path.join(runtimeDataDir(),"storage-settings.json");
type StorageSettings={outputsDir?:string;previousOutputDirs?:string[]};
function storageSettings():StorageSettings{try{return JSON.parse(fs.readFileSync(storageSettingsFile(),"utf8")) as StorageSettings}catch{return {}}}
function savedOutputsDir(){return storageSettings().outputsDir?.trim()}
export const defaultRuntimeOutputsDir=()=>resolveRuntimeDirectory(process.env.AI_STUDIO_OUTPUTS_DIR||process.env.OUTPUTS_DIR,"outputs");
export const runtimeOutputsDir=()=>resolveRuntimeDirectory(savedOutputsDir(),defaultRuntimeOutputsDir());
export const runtimeOutputSearchDirs=()=>{const settings=storageSettings();return [...new Set([runtimeOutputsDir(),...(settings.previousOutputDirs||[]).map(item=>path.resolve(item))])].filter(Boolean)};
export async function saveRuntimeOutputsDir(value:string){const selected=value.trim();if(!selected)throw new Error("保存位置不能为空");if(!path.isAbsolute(selected))throw new Error("保存位置必须是完整的绝对路径");const resolved=path.resolve(selected),root=path.parse(resolved).root;if(resolved===root)throw new Error("不能把磁盘根目录直接设为保存位置");await fs.promises.mkdir(resolved,{recursive:true});await fs.promises.access(resolved,fs.constants.R_OK|fs.constants.W_OK);await fs.promises.mkdir(runtimeDataDir(),{recursive:true});const current=runtimeOutputsDir(),existing=storageSettings(),previousOutputDirs=[...new Set([...(existing.previousOutputDirs||[]),current])].filter(item=>path.resolve(item)!==resolved),temporary=`${storageSettingsFile()}.tmp`;await fs.promises.writeFile(temporary,JSON.stringify({outputsDir:resolved,previousOutputDirs},null,2));await fs.promises.rename(temporary,storageSettingsFile());return resolved}
