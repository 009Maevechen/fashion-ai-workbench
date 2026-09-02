import {NextResponse} from "next/server";
import packageJson from "../../../../package.json";
import {listProjects,persistenceStatus} from "@/lib/db";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    await listProjects();
    return NextResponse.json({ok:true,version:packageJson.version,database:"ready",persistence:persistenceStatus()},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({ok:false,version:packageJson.version,database:"error",error:error instanceof Error?error.message:"数据库不可用"},{status:503});
  }
}
