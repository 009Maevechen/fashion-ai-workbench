const DEFAULT_LIMIT=6000;

export function normalizeTryonDetailRequirements(value:string,limit=DEFAULT_LIMIT){
  const seen=new Set<string>(),parts:string[]=[];
  for(const raw of value.replace(/\r\n?/g,"\n").split(/\n+/)){
    const part=raw.trim().replace(/[ \t]+/g," ");
    if(!part)continue;
    const key=part.replace(/\s/g,"");
    if(seen.has(key))continue;
    seen.add(key);parts.push(part);
  }
  const result=parts.join("\n");
  if(result.length<=limit)return result;
  const clipped=result.slice(0,limit),boundary=Math.max(clipped.lastIndexOf("。"),clipped.lastIndexOf("；"),clipped.lastIndexOf("\n"));
  return (boundary>=Math.floor(limit*0.75)?clipped.slice(0,boundary+1):clipped).trim();
}

export function composeTryonDetailRequirements(...parts:string[]){
  return normalizeTryonDetailRequirements(parts.filter(Boolean).join("\n"));
}
