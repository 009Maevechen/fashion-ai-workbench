const STORED_IMAGE_PREFIX="/api/files/";

/**
 * Convert image references saved by older desktop builds into the canonical
 * workbench URL. Windows builds have historically persisted absolute localhost
 * URLs and backslash-separated paths, while the server only accepts /api/files/.
 */
export function canonicalStoredImageReference(value:unknown):string|undefined{
  if(typeof value!=="string")return undefined;
  const raw=value.trim();
  if(!raw)return undefined;
  const normalized=raw.replaceAll("\\","/");
  if(normalized.startsWith(STORED_IMAGE_PREFIX))return normalized;
  if(normalized.startsWith("api/files/"))return `/${normalized}`;
  try{
    const url=new URL(normalized);
    const pathname=url.pathname.replaceAll("\\","/");
    return pathname.startsWith(STORED_IMAGE_PREFIX)?pathname:undefined;
  }catch{return undefined}
}

export function resolveStoredImageReference(current:unknown,fallback:unknown,label:string){
  const resolved=canonicalStoredImageReference(current)||canonicalStoredImageReference(fallback);
  if(!resolved)throw new Error(`${label}未完成本地保存，请重新选择或上传图片后再生成`);
  return resolved;
}
