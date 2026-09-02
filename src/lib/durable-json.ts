import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

async function syncDirectory(directory:string){
  try{const handle=await fs.open(directory,"r");try{await handle.sync()}finally{await handle.close()}}catch{}
}

export async function durableWriteFile(target:string,data:string|Buffer,mode=0o600){
  const directory=path.dirname(target),temporary=path.join(directory,`.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  await fs.mkdir(directory,{recursive:true});
  try{
    const handle=await fs.open(temporary,"wx",mode);
    try{await handle.writeFile(data);await handle.sync()}finally{await handle.close()}
    let renamed=false,lastError:unknown;
    for(let attempt=0;attempt<6&&!renamed;attempt++)try{await fs.rename(temporary,target);renamed=true}catch(error){lastError=error;const code=(error as NodeJS.ErrnoException).code;if(!["EPERM","EACCES","EBUSY"].includes(code||"")||attempt===5)throw error;await new Promise(resolve=>setTimeout(resolve,40*(2**attempt)))}
    if(!renamed)throw lastError;
    await syncDirectory(directory);
  }finally{await fs.unlink(temporary).catch(()=>{})}
}

export async function durableWriteJson(target:string,value:unknown,mode=0o600){
  await durableWriteFile(target,`${JSON.stringify(value,null,2)}\n`,mode);
}

export async function readValidJson<T>(target:string,validate:(value:unknown)=>value is T){
  const parsed=JSON.parse(await fs.readFile(target,"utf8")) as unknown;
  if(!validate(parsed))throw new Error(`数据文件结构无效：${path.basename(target)}`);
  return parsed;
}

export async function readJsonWithBackups<T>(primary:string,backups:string[],validate:(value:unknown)=>value is T){
  let missing=true,lastError:unknown;
  for(const candidate of [primary,...backups])try{return {value:await readValidJson(candidate,validate),source:candidate}}catch(error){lastError=error;if((error as NodeJS.ErrnoException).code!=="ENOENT")missing=false}
  if(missing)return undefined;
  throw lastError;
}
