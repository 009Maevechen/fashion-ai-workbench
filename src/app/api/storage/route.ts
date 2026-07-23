import {NextResponse} from "next/server";
import {emptyOutputCache,emptyTrash,storageStats} from "@/lib/ai/storage";
export async function GET(){return NextResponse.json(await storageStats())}
export async function DELETE(){await emptyTrash();return NextResponse.json(await storageStats())}
export async function POST(request:Request){
  try{const {action}=await request.json();if(action!=="clear-cache")throw new Error("不支持的存储操作");await emptyOutputCache();return NextResponse.json(await storageStats())}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"清理缓存失败"},{status:400})}
}
