import "server-only";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import {lookup} from "node:dns/promises";
import path from "node:path";
import {timeout} from "./config";
import {isPrivateAddress,isProxySyntheticAddress,validateRemoteImageUrl} from "./remote-url";
import {safeSegment} from "./validators";
import {isSafeStoredPath,outputSegments} from "./storage-paths";
import {runtimeOutputSearchDirs,runtimeOutputsDir} from "../runtime-paths";
import {durableWriteFile} from "../durable-json";

let root=runtimeOutputsDir();
export function updateOutputRoot(next:string){root=path.resolve(next)}
export function outputPath(sku:string,folder:string,file:string){const target=path.resolve(root,...outputSegments(sku,folder,file));if(!target.startsWith(root+path.sep))throw new Error("非法输出路径");return target}
export async function saveOutput(sku:string,folder:string,file:string,data:Buffer){let segments=outputSegments(sku,folder,file),p=path.resolve(root,...segments);if(!p.startsWith(root+path.sep))throw new Error("非法输出路径");await fs.mkdir(path.dirname(p),{recursive:true});try{await fs.access(p);const parsed=path.parse(segments.at(-1)||"image.jpg"),versioned=`${parsed.name}_v${Date.now()}-${crypto.randomUUID().slice(0,8)}${parsed.ext||".jpg"}`;segments=[...segments.slice(0,-1),versioned];p=path.resolve(root,...segments)}catch{}await durableWriteFile(p,data);return `/api/files/${segments.map(encodeURIComponent).join("/")}`}
export async function saveProductAnalysisTemporary(projectId:string,file:string,data:Buffer){const segments=[".cache","product-analysis",safeSegment(projectId),safeSegment(file)],p=path.resolve(root,...segments);if(!p.startsWith(root+path.sep))throw new Error("非法临时文件路径");await fs.mkdir(path.dirname(p),{recursive:true});await durableWriteFile(p,data);return `/api/files/${segments.map(encodeURIComponent).join("/")}`}
export async function clearProductAnalysisTemporary(projectId:string){const target=path.resolve(root,".cache","product-analysis",safeSegment(projectId));if(!target.startsWith(root+path.sep))throw new Error("非法临时文件路径");await fs.rm(target,{recursive:true,force:true})}
export async function readOutput(parts:string[]){if(!isSafeStoredPath(parts))throw new Error("非法文件路径");for(const directory of runtimeOutputSearchDirs()){const p=path.resolve(directory,...parts);if(!p.startsWith(directory+path.sep))throw new Error("非法文件路径");try{const data=await fs.readFile(p);if(path.resolve(directory)!==path.resolve(root)){const migrated=path.resolve(root,...parts);if(migrated.startsWith(root+path.sep))await durableWriteFile(migrated,data).catch(()=>{})}return data}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error}}throw new Error("图片文件不存在或保存位置已失效")}
const MAX_DOWNLOAD_BYTES=30*1024*1024;
async function assertPublicRemoteUrl(raw:string){
  const url=validateRemoteImageUrl(raw),hostname=url.hostname.replace(/^\[|\]$/g,"");
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)&&!hostname.includes(":")){
    const addresses=await lookup(hostname,{all:true,verbatim:true}).catch(()=>{throw new Error("无法解析模型图片地址")});
    const unsafe=addresses.some(item=>isPrivateAddress(item.address)&&!isProxySyntheticAddress(item.address));
    if(!addresses.length||unsafe)throw new Error("模型图片地址解析到了本机或内网");
  }
  return url;
}
async function readLimited(response:Response){
  const declared=Number(response.headers.get("content-length")||0);
  if(declared>MAX_DOWNLOAD_BYTES)throw new Error("模型返回图片超过 30MB 限制");
  if(!response.body)throw new Error("模型返回图片没有可读取的内容");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;if(!value)continue;
      total+=value.byteLength;if(total>MAX_DOWNLOAD_BYTES)throw new Error("模型返回图片超过 30MB 限制");chunks.push(value);
    }
  }catch(error){await reader.cancel().catch(()=>{});throw error}
  return Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)),total);
}
export async function downloadImage(raw:string,signal?:AbortSignal,_trustedHostname?:string){
  void _trustedHostname;
  let current=raw;
  const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(timeout())]):AbortSignal.timeout(timeout());
  for(let redirect=0;redirect<=5;redirect++){
    const url=await assertPublicRemoteUrl(current);
    const response=await fetch(url,{signal:requestSignal,redirect:"manual",headers:{Accept:"image/jpeg,image/png,image/webp"}});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get("location");if(!location)throw new Error("模型图片跳转地址缺失");
      current=new URL(location,url).toString();continue;
    }
    if(!response.ok)throw new Error(`下载生成图片失败：HTTP ${response.status}`);
    const mime=response.headers.get("content-type")||"";
    return {buffer:await readLimited(response),mime};
  }
  throw new Error("模型图片地址跳转次数过多");
}
export async function localImage(url:string){const prefix="/api/files/";if(!url.startsWith(prefix))throw new Error("只能读取工作台持久化图片");return readOutput(url.slice(prefix.length).split("/").map(decodeURIComponent))}
export const toDataUrl=(b:Buffer,mime="image/jpeg")=>`data:${mime};base64,${b.toString("base64")}`;
export async function moveProjectToTrash(sku:string,projectId:string){const source=path.resolve(root,safeSegment(sku));try{await fs.access(source)}catch{return false}const trash=path.resolve(root,".trash",`${safeSegment(projectId)}-${Date.now()}`);await fs.mkdir(path.dirname(trash),{recursive:true});await fs.rename(source,trash);return true}
export async function moveFileToTrash(url:string,projectId:string){const prefix="/api/files/";if(!url.startsWith(prefix))return false;const parts=url.slice(prefix.length).split("/").map(decodeURIComponent);if(parts.some(x=>x!==safeSegment(x)))throw new Error("非法文件路径");const source=path.resolve(root,...parts),target=path.resolve(root,".trash",`${safeSegment(projectId)}-${Date.now()}`,...parts.slice(1));if(!source.startsWith(root+path.sep))throw new Error("非法文件路径");await fs.mkdir(path.dirname(target),{recursive:true});await fs.rename(source,target).catch(()=>{});return true}
export async function moveFilesToTrashStrict(urls:string[],projectId:string){const prefix="/api/files/",batch=`${safeSegment(projectId)}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,moved:{source:string;target:string}[]=[];try{for(const url of [...new Set(urls)]){if(!url.startsWith(prefix))throw new Error("只能清理工作台持久化素材");const parts=url.slice(prefix.length).split("/").map(decodeURIComponent);if(!isSafeStoredPath(parts))throw new Error("非法素材路径");const source=path.resolve(root,...parts),target=path.resolve(root,".trash",batch,...parts);if(!source.startsWith(root+path.sep)||!target.startsWith(root+path.sep))throw new Error("非法素材路径");try{await fs.access(source)}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")continue;throw error}await fs.mkdir(path.dirname(target),{recursive:true});await fs.rename(source,target);moved.push({source,target})}return moved.length}catch(error){for(const item of moved.reverse()){await fs.mkdir(path.dirname(item.source),{recursive:true}).catch(()=>{});await fs.rename(item.target,item.source).catch(()=>{})}throw new Error(`清理素材文件失败：${error instanceof Error?error.message:"文件系统错误"}`)}}
export async function movePoseLibraryFileToTrash(url:string){
  const prefix="/api/files/";if(!url.startsWith(prefix))throw new Error("只能清理工作台姿势库文件");
  const parts=url.slice(prefix.length).split("/").map(decodeURIComponent);
  if(!isSafeStoredPath(parts)||parts[0]!=="pose-library")throw new Error("非法姿势库路径");
  const source=path.resolve(root,...parts),target=path.resolve(root,".trash","pose-library",`${Date.now()}-${crypto.randomUUID()}`,...parts.slice(1));
  if(!source.startsWith(root+path.sep)||!target.startsWith(root+path.sep))throw new Error("非法姿势库路径");
  try{await fs.access(source)}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error}
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.rename(source,target);return true;
}
async function dirSize(dir:string):Promise<number>{try{const entries=await fs.readdir(dir,{withFileTypes:true});let total=0;for(const e of entries){const p=path.join(dir,e.name);total+=e.isDirectory()?await dirSize(p):(await fs.stat(p)).size}return total}catch{return 0}}
export async function storageStats(){const trash=await dirSize(path.join(root,".trash")),cache=await dirSize(path.join(root,".cache"));return {outputsBytes:Math.max(0,(await dirSize(root))-trash-cache),trashBytes:trash,cacheBytes:cache,outputPath:root}}
export async function emptyTrash(){const trash=path.join(root,".trash");await fs.rm(trash,{recursive:true,force:true});await fs.mkdir(trash,{recursive:true})}
export async function emptyOutputCache(){const cache=path.join(root,".cache");await fs.rm(cache,{recursive:true,force:true});await fs.mkdir(cache,{recursive:true})}
