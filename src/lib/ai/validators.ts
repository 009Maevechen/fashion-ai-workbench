import crypto from "node:crypto";
import sharp from "sharp";
import {assessImageQuality} from "../image-quality-check";
import {MAX_INPUT_DIMENSION,MAX_INPUT_PIXELS,resizeToJpeg} from "../image-limits";
const ALLOWED=new Set(["image/jpeg","image/png","image/webp"]);export const MAX_IMAGE_BYTES=30*1024*1024;
const HEIF_BRANDS=new Set(["heic","heix","hevc","hevx","heim","heis","mif1","msf1"]);
function isHeif(buffer:Buffer){return buffer.length>=12&&buffer.subarray(4,8).toString("ascii")==="ftyp"&&HEIF_BRANDS.has(buffer.subarray(8,12).toString("ascii"))}
async function decodableBuffer(buffer:Buffer){
  try{await sharp(buffer,{failOn:"error"}).metadata();return buffer}catch(error){
    if(!isHeif(buffer))throw error;
    // Load the HEIC decoder only for actual HEIC/HEIF files. A missing optional
    // decoder must never prevent ordinary JPG/PNG/WebP uploads on Windows.
    const {default:heicConvert}=await import("heic-convert");
    const converted=await heicConvert({buffer,format:"JPEG",quality:.96});
    return converted instanceof ArrayBuffer?Buffer.from(converted):Buffer.from(converted.buffer,converted.byteOffset,converted.byteLength);
  }
}
export async function validateUpload(file:File){
  if(file.size<512||file.size>MAX_IMAGE_BYTES)throw new Error("图片大小必须在 512B 到 30MB 之间");
  const original=Buffer.from(await file.arrayBuffer());
  const decoded=await decodableBuffer(original).catch(()=>{throw new Error("图片无法解析或文件已损坏；请确认它是真实、完整的图片文件")});
  const metadata=await sharp(decoded,{failOn:"error",limitInputPixels:MAX_INPUT_PIXELS}).metadata().catch(()=>{throw new Error("图片无法解析或文件已损坏")});
  if(!metadata.width||!metadata.height)throw new Error("图片缺少有效尺寸");
  return resizeToJpeg(decoded,MAX_INPUT_DIMENSION,96);
}
export async function prepareProviderInput(buffer:Buffer){
  const metadata=await sharp(buffer,{failOn:"error",limitInputPixels:MAX_INPUT_PIXELS}).metadata().catch(()=>{throw new Error("输入图片无法解析或文件已损坏，请重新上传原始 JPG、PNG 或 WebP 图片")});
  if(!metadata.width||!metadata.height)throw new Error("输入图片缺少有效尺寸，请重新上传图片");
  // Older Windows builds could save valid PNG/WebP bytes with a .jpg suffix.
  // Re-encoding here makes the declared MIME and actual bytes identical before
  // they are sent to OpenAI-compatible relays and other image providers.
  // 大图先按长边上限降采样，避免全图解码耗尽内存。
  const normalized=await resizeToJpeg(buffer,MAX_INPUT_DIMENSION,95).catch(()=>{throw new Error("输入图片转换失败，请重新上传原始图片")});
  return {buffer:normalized,mime:"image/jpeg" as const};
}
async function gridLineRisk(buffer:Buffer){const {data,info}=await sharp(buffer).resize(120,160,{fit:"fill"}).greyscale().raw().toBuffer({resolveWithObject:true});const columns=[Math.floor(info.width/3),Math.floor(info.width/2),Math.floor(info.width*2/3)],rows=[Math.floor(info.height/3),Math.floor(info.height/2),Math.floor(info.height*2/3)];for(const x of columns){let hits=0;for(let y=0;y<info.height;y++){const p=data[y*info.width+x],left=data[y*info.width+Math.max(0,x-2)],right=data[y*info.width+Math.min(info.width-1,x+2)];if(Math.abs(p-(left+right)/2)>55)hits++}if(hits/info.height>.72)return true}for(const y of rows){let hits=0;for(let x=0;x<info.width;x++){const p=data[y*info.width+x],top=data[Math.max(0,y-2)*info.width+x],bottom=data[Math.min(info.height-1,y+2)*info.width+x];if(Math.abs(p-(top+bottom)/2)>55)hits++}if(hits/info.width>.72)return true}return false}
async function borderDifference(a:Buffer,b:Buffer){const read=async(buffer:Buffer)=>{const {data,info}=await sharp(buffer).resize(32,32,{fit:"fill"}).removeAlpha().raw().toBuffer({resolveWithObject:true}),sum=[0,0,0];let count=0;for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(x<3||x>28||y<3||y>28){const at=(y*32+x)*info.channels;for(let c=0;c<3;c++)sum[c]+=data[at+c];count++}return sum.map(v=>v/count)};const [one,two]=await Promise.all([read(a),read(b)]);return one.reduce((sum,value,index)=>sum+Math.abs(value-two[index]),0)/3}
export async function validateOutput(buffer:Buffer,mime:string,inputHashes:string[]=[],otherHashes:string[]=[],backgroundReference?:Buffer){if(!ALLOWED.has(mime.split(";")[0]))throw new Error(`模型返回的不是有效图片（${mime||"未知类型"}）`);if(buffer.length<1024||buffer.length>30*1024*1024)throw new Error("模型返回图片大小异常");const meta=await sharp(buffer).metadata().catch(()=>{throw new Error("模型返回图片无法解码")});if(!meta.width||!meta.height)throw new Error("模型返回图片缺少尺寸");const hash=sha(buffer);if(inputHashes.includes(hash))throw new Error("生成结果与输入图片完全相同，已拒绝假成功");if(otherHashes.includes(hash))throw new Error("多个候选结果完全重复，已拒绝假成功");const ratio=meta.width/meta.height,warnings:string[]=[];if(Math.abs(ratio-.75)>.08)warnings.push("图片比例偏离3:4，需要人工审核");if(ratio>1.25)warnings.push("图片为横向宽图，存在拼图或多宫格风险");const [gridRisk,borderDelta,quality]=await Promise.all([gridLineRisk(buffer),backgroundReference?borderDifference(backgroundReference,buffer):Promise.resolve(0),assessImageQuality(buffer)]);if(gridRisk)warnings.push("检测到明显分割线，存在拼图或多宫格风险");if(backgroundReference&&borderDelta>38)warnings.push("图片边缘平均颜色变化较大，背景需要人工审核");for(const issue of quality.issues)warnings.push(issue);return {hash,width:meta.width,height:meta.height,mime:mime.split(";")[0],ratio,sharpnessScore:quality.sharpnessScore,needsReview:warnings.length>0,warnings}}
export const sha=(buffer:Buffer)=>crypto.createHash("sha256").update(buffer).digest("hex");
export function safeSegment(value:string){const safe=value.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu,"-").replace(/^[-.]+|[-.]+$/g,"").slice(0,80),base=safe.split(".")[0].toUpperCase();return (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(base)?`_${safe}`:safe)||"untitled"}
