import {NextResponse} from "next/server";
import {readOutput} from "@/lib/ai/storage";

const mimeFor=(parts:string[])=>{const ext=parts.at(-1)?.split(".").at(-1)?.toLowerCase();return ext==="png"?"image/png":ext==="webp"?"image/webp":"image/jpeg"};
const headers=(parts:string[],size:number)=>({"Content-Type":mimeFor(parts),"Content-Length":String(size),"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"});

export async function GET(_:Request,{params}:{params:Promise<{path:string[]}>}){
  try{const parts=(await params).path,b=await readOutput(parts);return new NextResponse(b,{headers:headers(parts,b.byteLength)})}
  catch{return NextResponse.json({error:"图片不存在或路径非法"},{status:404})}
}
export async function HEAD(_:Request,{params}:{params:Promise<{path:string[]}>}){
  try{const parts=(await params).path,b=await readOutput(parts);return new NextResponse(null,{headers:headers(parts,b.byteLength)})}
  catch{return new NextResponse(null,{status:404})}
}
