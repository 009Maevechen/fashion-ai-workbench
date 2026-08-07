export async function readSycResponse(response:Response){
  const text=await response.text();
  if(/^\s*<!doctype html|^\s*<html/i.test(text))throw new Error("SYC 中转站返回了 HTML 页面，可能被网关或 Cloudflare 拦截");
  let data:unknown;
  try{data=JSON.parse(text)}catch{const type=response.headers.get("content-type")||"未知类型";throw new Error(`SYC 中转站返回的不是有效 JSON（HTTP ${response.status}，${type}）`)}
  if(!response.ok){
    const item=data as {error?:string|{message?:string};message?:string};
    const detail=typeof item.error==="string"?item.error:item.error?.message||item.message;
    if(response.status===401)throw new Error("SYC 认证失败：API Key 无效（HTTP 401）");
    if(response.status===403)throw new Error("SYC 认证失败：当前 API Key 没有权限（HTTP 403）");
    if(response.status===404)throw new Error("SYC 地址或模型接口不存在（HTTP 404）");
    if(response.status>=500)throw new Error(`SYC 服务端错误（HTTP ${response.status}）：${detail||"请稍后重试"}`);
    throw new Error(`SYC 请求失败（HTTP ${response.status}）：${detail||"未知错误"}`);
  }
  return data;
}
export function sycNetworkError(error:unknown){
  if(error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError"))return new Error("SYC 请求超时，请检查网络或调大请求超时");
  return new Error(`无法连接 SYC 中转站：${error instanceof Error?error.message:"网络错误"}`);
}
