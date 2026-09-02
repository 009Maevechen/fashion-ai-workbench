export function thumbnailUrl(url:string|undefined,width=480){
  if(!url?.startsWith("/api/files/"))return url||"";
  const separator=url.includes("?")?"&":"?";
  return `${url}${separator}thumbnail=${Math.max(120,Math.min(960,Math.round(width)))}`;
}
