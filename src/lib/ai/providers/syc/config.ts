export const SYC_PROVIDER_TYPE="syc-openai-compatible" as const;
export const SYC_DEFAULT_BASE_URL="https://sycagent.top/v1";

export function normalizeSycBaseUrl(raw:string){
  let url:URL;
  try{url=new URL(raw.trim())}catch{throw new Error("SYC API URL 不是有效网址")}
  if(url.protocol!=="https:")throw new Error("SYC API URL 只支持 HTTPS");
  if(url.username||url.password)throw new Error("SYC API URL 不得包含账号或密码");
  if(url.search||url.hash)throw new Error("SYC API URL 不得包含查询参数或锚点");
  const cleanPath=url.pathname.replace(/\/+$/,"");
  if(cleanPath&&cleanPath!=="/v1"&&!/^\/v1(?:\/v1)+$/.test(cleanPath))throw new Error("SYC API URL 只能填写域名或 /v1 根路径");
  url.pathname="/v1";url.search="";url.hash="";
  return url.toString().replace(/\/$/,"");
}

export function sycEndpoint(baseUrl:string,resource:"models"|"generations"|"edits"){
  const root=baseUrl.replace(/\/+$/,"");
  return resource==="models"?`${root}/models`:`${root}/images/${resource}`;
}
