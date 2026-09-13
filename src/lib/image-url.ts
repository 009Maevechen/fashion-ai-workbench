export function thumbnailUrl(url:string|undefined,width=480){
  if(!url?.startsWith("/api/files/"))return url||"";
  const separator=url.includes("?")?"&":"?";
  return `${url}${separator}thumbnail=${Math.max(120,Math.min(600,Math.round(width)))}`;
}

export function previewUrl(url:string|undefined,width=960){
  if(!url?.startsWith("/api/files/"))return url||"";
  const separator=url.includes("?")?"&":"?";
  return `${url}${separator}preview=${Math.max(600,Math.min(1280,Math.round(width)))}`;
}

/** 复制、下载等操作必须读取原图，不能把列表缩略图误当成原始照片。 */
export function originalImageUrl(url:string){
  if(!url||url.startsWith("blob:")||url.startsWith("data:"))return url;
  try{
    const absolute=/^[a-z][a-z\d+.-]*:/i.test(url);
    const parsed=new URL(url,"http://workbench.local");
    parsed.searchParams.delete("thumbnail");
    parsed.searchParams.delete("preview");
    return absolute?parsed.href:`${parsed.pathname}${parsed.search}${parsed.hash}`;
  }catch{return url}
}
