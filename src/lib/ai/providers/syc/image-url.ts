import {isPrivateAddress} from "../../remote-url";

export function normalizeSycImageUrl(raw:string,baseUrl:string){
  const imageUrl=new URL(raw),hostname=imageUrl.hostname.replace(/^\[|\]$/g,"");
  const internal=hostname==="localhost"||hostname.endsWith(".localhost")||hostname.endsWith(".local")||isPrivateAddress(hostname);
  if(!internal)return raw;
  const providerUrl=new URL(baseUrl);
  if(providerUrl.protocol!=="https:")throw new Error("SYC 返回了内网图片地址，且当前 SYC Base URL 不是安全的 HTTPS 公共地址");
  imageUrl.protocol=providerUrl.protocol;imageUrl.hostname=providerUrl.hostname;imageUrl.port=providerUrl.port;
  return imageUrl.toString();
}
