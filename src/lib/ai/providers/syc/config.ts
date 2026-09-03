export const SYC_PROVIDER_TYPE="syc-openai-compatible" as const;
export const SYC_DEFAULT_BASE_URL="https://ai.sycagent.top/v1";
export const SYC_LEGACY_BASE_URL="https://sycagent.top/v1";

export function migrateSycBaseUrl(raw:string){
  const value=raw.trim().replace(/\/+$/,""),legacy=SYC_LEGACY_BASE_URL.replace(/\/+$/,""),current=SYC_DEFAULT_BASE_URL.replace(/\/+$/,"");
  return value===legacy?current:raw.trim();
}

export function normalizeSycBaseUrl(raw:string){
  const value=migrateSycBaseUrl(raw);
  let url:URL;
  try{url=new URL(value)}catch{throw new Error("SYC API URL 不是有效网址")}
  if(url.protocol!=="https:"&&url.protocol!=="http:")throw new Error("SYC API URL 只支持 HTTP 或 HTTPS");
  if(url.username||url.password)throw new Error("SYC API URL 不得包含账号或密码");
  if(url.search||url.hash)throw new Error("SYC API URL 不得包含查询参数或锚点");
  return value;
}

export function sycEndpoint(baseUrl:string,resource:"models"|"generations"|"edits"){
  const root=baseUrl.replace(/\/+$/,"");
  return resource==="models"?`${root}/models`:`${root}/images/${resource}`;
}
