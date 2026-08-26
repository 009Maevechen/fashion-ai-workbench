import {safeSegment} from "./validators";
export function outputSegments(sku:string,folder:string,file:string){return [safeSegment(sku),...folder.split("/").filter(Boolean).map(safeSegment),safeSegment(file)]}
export function isSafeStoredPath(parts:string[]){return parts.length>=3&&parts.every((part,index)=>(index===0&&part===".cache")||part===safeSegment(part))}
