import sharp from "sharp";
import {MAX_INPUT_PIXELS} from "./image-limits";

export type InpaintBoundaryCheck={
  passed:boolean;
  protectedPixelMeanDelta:number;
  protectedChangedRatio:number;
  issues:string[];
};

/** Local pixel check for the rule “mask outside is locked”. */
export async function checkInpaintProtectedRegion(source:Buffer,result:Buffer,mask:Buffer):Promise<InpaintBoundaryCheck>{
  const size={width:288,height:384};
  const rgb=async(buffer:Buffer)=>sharp(buffer,{failOn:"error",limitInputPixels:MAX_INPUT_PIXELS}).rotate().resize({...size,fit:"fill"}).removeAlpha().raw().toBuffer();
  const alpha=await sharp(mask,{failOn:"error",limitInputPixels:MAX_INPUT_PIXELS}).resize({...size,fit:"fill",kernel:"nearest"}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const [before,after]=await Promise.all([rgb(source),rgb(result)]);
  let protectedPixels=0,totalDelta=0,changed=0;
  for(let pixel=0;pixel<size.width*size.height;pixel++){
    const maskAt=pixel*alpha.info.channels;
    const editable=alpha.info.channels>=4?alpha.data[maskAt+3]>24:alpha.data[maskAt]>24;
    if(editable)continue;
    const at=pixel*3,delta=(Math.abs(before[at]-after[at])+Math.abs(before[at+1]-after[at+1])+Math.abs(before[at+2]-after[at+2]))/3;
    protectedPixels++;totalDelta+=delta;if(delta>24)changed++;
  }
  const protectedPixelMeanDelta=protectedPixels?totalDelta/protectedPixels:0;
  const protectedChangedRatio=protectedPixels?changed/protectedPixels:0;
  const issues:string[]=[];
  if(protectedPixels===0)issues.push("蒙版没有保留可锁定的外部区域");
  if(protectedPixelMeanDelta>10||protectedChangedRatio>0.12)issues.push(`Mask外区域发生明显变化（平均差异 ${protectedPixelMeanDelta.toFixed(1)}，变化像素 ${(protectedChangedRatio*100).toFixed(1)}%）`);
  return {passed:issues.length===0,protectedPixelMeanDelta,protectedChangedRatio,issues};
}
