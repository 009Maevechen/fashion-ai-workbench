import {NextResponse} from "next/server";
import {readOutput} from "@/lib/ai/storage";
import sharp from "sharp";
import {MAX_THUMBNAIL_PIXELS} from "@/lib/image-limits";

const mimeFor=(parts:string[])=>{const ext=parts.at(-1)?.split(".").at(-1)?.toLowerCase();return ext==="png"?"image/png":ext==="webp"?"image/webp":"image/jpeg"};
const headers=(parts:string[],size:number)=>({"Content-Type":mimeFor(parts),"Content-Length":String(size),"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"});

export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){
  try{const parts=(await params).path,original=await readOutput(parts),requested=Number(new URL(request.url).searchParams.get("thumbnail")||0),b=requested?await sharp(original,{limitInputPixels:MAX_THUMBNAIL_PIXELS}).resize({width:Math.max(120,Math.min(960,requested)),height:1280,fit:"inside",withoutEnlargement:true}).rotate().jpeg({quality:78,mozjpeg:true}).toBuffer():original;return new NextResponse(new Uint8Array(b),{headers:{...headers(parts,b.byteLength),"Content-Type":requested?"image/jpeg":mimeFor(parts),"Cache-Control":requested?"private, max-age=86400, immutable":"private, max-age=3600"}})}
  catch{return NextResponse.json({error:"图片不存在或路径非法"},{status:404})}
}
export async function HEAD(_:Request,{params}:{params:Promise<{path:string[]}>}){
  try{const parts=(await params).path,b=await readOutput(parts);return new NextResponse(null,{headers:headers(parts,b.byteLength)})}
  catch{return new NextResponse(null,{status:404})}
}
