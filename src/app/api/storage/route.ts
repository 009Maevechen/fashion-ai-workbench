import {NextResponse} from "next/server";
import {emptyOutputCache,emptyTrash,storageStats,updateOutputRoot} from "@/lib/ai/storage";
import {saveRuntimeOutputsDir} from "@/lib/runtime-paths";
export async function GET(){return NextResponse.json(await storageStats())}
export async function DELETE(){await emptyTrash();return NextResponse.json(await storageStats())}
export async function POST(request:Request){
  try{const {action,outputPath}=await request.json();if(action==="clear-cache")await emptyOutputCache();else if(action==="set-output-path")updateOutputRoot(await saveRuntimeOutputsDir(String(outputPath||"")));else throw new Error("不支持的存储操作");return NextResponse.json(await storageStats())}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"清理缓存失败"},{status:400})}
}
