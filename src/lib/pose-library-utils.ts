import type {PoseShotType,PoseTemplateGroup,ProductType} from "./db";

export const normalizePoseSignature=(value:string)=>value.toLocaleLowerCase("zh-CN").replace(/姿势\s*0?[123]|pose\s*0?[123]/g,"").replace(/[\s\p{P}\p{S}]/gu,"");

export function perceptualHashDistance(a:string,b:string){
  if(a.length!==b.length)return Number.POSITIVE_INFINITY;
  let distance=0;
  for(let index=0;index<a.length;index++){let value=parseInt(a[index],16)^parseInt(b[index],16);while(value){distance+=value&1;value>>=1}}
  return distance;
}

export function assertThreeDistinctPoses(items:Array<{imageHash:string;perceptualHash:string;poseSignature?:string}>){
  if(items.length!==3)throw new Error("姿势模板组必须正好包含3个姿势");
  for(let left=0;left<3;left++)for(let right=left+1;right<3;right++){
    const sameSignature=Boolean(items[left].poseSignature&&items[left].poseSignature===items[right].poseSignature);
    if(items[left].imageHash===items[right].imageHash||perceptualHashDistance(items[left].perceptualHash,items[right].perceptualHash)<=3||sameSignature)throw new Error(`姿势${left+1}与姿势${right+1}重复，同一模板组不能保存相同姿势`);
  }
}

export function poseLibrarySourceAvailability(referenceImages:string[],resultImages:string[],reviews:Record<string,string>){
  return {
    references:referenceImages.length===3&&referenceImages.every(Boolean),
    results:resultImages.length===3&&resultImages.every(Boolean)&&[1,2,3].every(slot=>reviews[String(slot)]==="approved"),
  };
}

export function recommendedPoseGroups(groups:PoseTemplateGroup[],productType:ProductType){
  const preferredShots:Record<ProductType,PoseShotType[]>={上衣:["upper_body","full_body"],裤装:["full_body","lower_body"],连衣裙:["full_body"],半身裙:["full_body","lower_body"],套装:["full_body"]};
  return groups.filter(group=>!group.archived).sort((a,b)=>{const aType=a.productTypes.includes(productType)?3:0,bType=b.productTypes.includes(productType)?3:0,aShot=preferredShots[productType].includes(a.shotType)?2:0,bShot=preferredShots[productType].includes(b.shotType)?2:0;return (bType+bShot+(b.favorite?1:0))-(aType+aShot+(a.favorite?1:0))||b.usageCount-a.usageCount});
}
