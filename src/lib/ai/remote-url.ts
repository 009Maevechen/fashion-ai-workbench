import {isIP} from "node:net";

function isPrivateAddress(address:string){
  if(isIP(address)===4){
    const [a,b]=address.split(".").map(Number);
    return a===0||a===10||a===127||a>=224||
      (a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||
      (a===192&&b===168)||(a===198&&(b===18||b===19));
  }
  const value=address.toLowerCase().split("%")[0];
  if(value.startsWith("::ffff:"))return isPrivateAddress(value.slice(7));
  return value==="::"||value==="::1"||value.startsWith("fc")||value.startsWith("fd")||
    /^fe[89ab]/.test(value)||value.startsWith("ff");
}

// Clash/Surge 等 TUN 代理的 Fake-IP 模式会把公共域名临时解析到
// RFC 2544 的 198.18.0.0/15。它不是目标服务器的真实内网地址；只有当
// URL 本身直接填写该 IP 时才必须拦截，公共域名的 DNS 结果可以继续交给代理。
function isProxySyntheticAddress(address:string){
  if(isIP(address)!==4)return false;
  const [a,b]=address.split(".").map(Number);
  return a===198&&(b===18||b===19);
}

function hostAllowed(hostname:string){
  const configured=(process.env.AI_IMAGE_DOWNLOAD_HOSTS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  return configured.length===0||configured.some(allowed=>hostname===allowed||hostname.endsWith(`.${allowed}`));
}

export function validateRemoteImageUrl(raw:string){
  let url:URL;
  try{url=new URL(raw)}catch{throw new Error("模型返回了无效的图片地址")}
  if(url.protocol!=="https:")throw new Error("模型图片地址必须使用 HTTPS");
  if(url.username||url.password)throw new Error("模型图片地址不得包含登录信息");
  if(url.port&&url.port!=="443")throw new Error("模型图片地址使用了不允许的端口");
  const hostname=url.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if(!hostname||hostname==="localhost"||hostname.endsWith(".localhost")||!hostAllowed(hostname))throw new Error("模型图片地址的域名不受信任");
  if(isIP(hostname)&&isPrivateAddress(hostname))throw new Error("模型图片地址不得访问本机或内网");
  return url;
}

export {isPrivateAddress,isProxySyntheticAddress};
