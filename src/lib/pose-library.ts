import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import sharp from "sharp";
import {
  addPoseTemplateGroup,getPoseTemplateGroup,getProject,listPoseTemplateGroups,patchPoseTemplateGroup,
  removePoseTemplateGroup,updateProject,
  type PoseFaceMode,type PoseShotType,type PoseTemplateGroup,type PoseTemplateItem,type ProductType,
} from "./db";
import {localImage,movePoseLibraryFileToTrash,outputPath,saveOutput} from "./ai/storage";
import {assertThreeDistinctPoses,normalizePoseSignature,perceptualHashDistance} from "./pose-library-utils";

export {normalizePoseSignature,perceptualHashDistance,recommendedPoseGroups} from "./pose-library-utils";

export type PoseTemplateInput={
  name:string;description?:string;productTypes:ProductType[];shotType:PoseShotType;faceMode:PoseFaceMode;
  styleTags?:string[];platformTags?:string[];displayFocus?:string[];favorite?:boolean;sourceProjectId?:string;
  images:[string,string,string];poseNames:[string,string,string];poseDescriptions:[string,string,string];
};

const unique=(items:string[])=>([...new Set(items.map(item=>item.trim()).filter(Boolean))]);
export async function imagePerceptualHash(buffer:Buffer){
  const {data}=await sharp(buffer).resize(9,8,{fit:"fill"}).greyscale().raw().toBuffer({resolveWithObject:true});
  let bits="";for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits+=data[y*9+x]>data[y*9+x+1]?"1":"0";
  return BigInt(`0b${bits}`).toString(16).padStart(16,"0");
}
function validateInput(input:PoseTemplateInput){
  if(!input.name.trim())throw new Error("模板组名称不能为空");
  if(input.productTypes.length<1)throw new Error("至少选择一个适用商品类型");
  if(input.images.length!==3||input.images.some(image=>!image?.startsWith("/api/files/")))throw new Error("姿势模板组必须包含3张已保存图片");
  if(input.poseNames.length!==3||input.poseNames.some(name=>!name.trim()))throw new Error("3个姿势都需要填写名称");
  if(input.poseDescriptions.length!==3||input.poseDescriptions.some(description=>!description.trim()))throw new Error("3个姿势都需要填写说明，以便识别重复姿势");
}
async function stablePoseImage(buffer:Buffer,imageHash:string){
  const filename=`${imageHash}.jpg`,thumbnail=`${imageHash}.jpg`,target=outputPath("pose-library","assets",filename),thumbTarget=outputPath("pose-library","thumbnails",thumbnail);
  try{await fs.access(target)}catch{await saveOutput("pose-library","assets",filename,await sharp(buffer).jpeg({quality:94}).toBuffer())}
  try{await fs.access(thumbTarget)}catch{await saveOutput("pose-library","thumbnails",thumbnail,await sharp(buffer).resize(360,480,{fit:"inside",withoutEnlargement:true}).jpeg({quality:84}).toBuffer())}
  return {referenceImagePath:`/api/files/pose-library/assets/${filename}`,thumbnailPath:`/api/files/pose-library/thumbnails/${thumbnail}`};
}

export async function createPoseTemplateGroup(input:PoseTemplateInput){
  validateInput(input);
  const existing=await listPoseTemplateGroups(),existingItems=existing.flatMap(group=>group.poses);
  const candidates=[] as Array<{buffer:Buffer;hash:string;perceptualHash:string;signature:string;source:string}>;
  for(let index=0;index<3;index++){
    const buffer=await localImage(input.images[index]);
    await sharp(buffer).metadata().catch(()=>{throw new Error(`姿势参考图${index+1}无法解码`)});
    const hash=crypto.createHash("sha256").update(buffer).digest("hex"),perceptualHash=await imagePerceptualHash(buffer);
    const signature=normalizePoseSignature(`${input.poseNames[index]} ${input.poseDescriptions[index]}`);
    candidates.push({buffer,hash,perceptualHash,signature,source:input.images[index]});
  }
  assertThreeDistinctPoses(candidates.map(candidate=>({imageHash:candidate.hash,perceptualHash:candidate.perceptualHash,poseSignature:candidate.signature})));
  const matched=candidates.map(candidate=>existingItems.find(item=>item.imageHash===candidate.hash||perceptualHashDistance(item.perceptualHash,candidate.perceptualHash)<=3||(candidate.signature.length>=6&&item.poseSignature===candidate.signature)));
  const duplicateGroup=existing.find(group=>group.poses.every((pose,index)=>matched[index]?.id===pose.id));
  if(duplicateGroup)return {group:duplicateGroup,created:false,deduplicated:true};
  const id=crypto.randomUUID(),now=new Date().toISOString(),poses=[] as PoseTemplateItem[];
  for(let index=0;index<3;index++){
    const candidate=candidates[index],reuse=matched[index],paths=reuse?{referenceImagePath:reuse.referenceImagePath,thumbnailPath:reuse.thumbnailPath}:await stablePoseImage(candidate.buffer,candidate.hash);
    poses.push({id:crypto.randomUUID(),poseIndex:(index+1) as 1|2|3,name:input.poseNames[index].trim(),description:input.poseDescriptions[index].trim(),referenceImagePath:paths.referenceImagePath,thumbnailPath:paths.thumbnailPath,sourceProjectId:input.sourceProjectId,sourceImagePath:candidate.source,imageHash:reuse?.imageHash||candidate.hash,perceptualHash:reuse?.perceptualHash||candidate.perceptualHash,poseSignature:candidate.signature});
  }
  const group:PoseTemplateGroup={id,name:input.name.trim(),description:input.description?.trim()||undefined,productTypes:[...new Set(input.productTypes)],shotType:input.shotType,faceMode:input.faceMode,styleTags:unique(input.styleTags||[]),platformTags:unique(input.platformTags||[]),displayFocus:unique(input.displayFocus||[]),favorite:input.favorite||false,archived:false,usageCount:0,createdAt:now,updatedAt:now,sourceProjectId:input.sourceProjectId,poses:poses as PoseTemplateGroup["poses"]};
  await addPoseTemplateGroup(group);return {group,created:true,deduplicated:matched.some(Boolean)};
}

export async function updatePoseTemplateMetadata(id:string,input:Partial<Pick<PoseTemplateGroup,"name"|"description"|"productTypes"|"shotType"|"faceMode"|"styleTags"|"platformTags"|"displayFocus"|"favorite"|"archived">>){
  const patch={...input,...(input.name!==undefined?{name:input.name.trim()}:{}),...(input.styleTags?{styleTags:unique(input.styleTags)}:{}),...(input.platformTags?{platformTags:unique(input.platformTags)}:{}),...(input.displayFocus?{displayFocus:unique(input.displayFocus)}:{})};
  if(patch.name!==undefined&&!patch.name)throw new Error("模板组名称不能为空");
  if(patch.productTypes&&patch.productTypes.length<1)throw new Error("至少选择一个适用商品类型");
  return patchPoseTemplateGroup(id,patch);
}
export async function duplicatePoseTemplateGroup(id:string){
  const source=await getPoseTemplateGroup(id);if(!source)throw new Error("姿势模板组不存在");
  const now=new Date().toISOString(),copy:PoseTemplateGroup={...structuredClone(source),id:crypto.randomUUID(),name:`${source.name} 副本`,favorite:false,archived:false,usageCount:0,createdAt:now,updatedAt:now,lastUsedAt:undefined,poses:source.poses.map((pose,index)=>({...pose,id:crypto.randomUUID(),poseIndex:(index+1) as 1|2|3})) as PoseTemplateGroup["poses"]};
  await addPoseTemplateGroup(copy);return copy;
}
export async function deletePoseTemplateGroup(id:string){
  const removed=await removePoseTemplateGroup(id),remaining=await listPoseTemplateGroups(),referenced=new Set(remaining.flatMap(group=>group.poses.flatMap(pose=>[pose.referenceImagePath,pose.thumbnailPath].filter(Boolean) as string[])));
  for(const pose of removed.poses)for(const url of [pose.referenceImagePath,pose.thumbnailPath])if(url&&!referenced.has(url))await movePoseLibraryFileToTrash(url);
  return removed;
}
export async function applyPoseTemplateGroup(id:string,projectId:string){
  const [group,project]=await Promise.all([getPoseTemplateGroup(id),getProject(projectId)]);if(!group)throw new Error("姿势模板已归档或删除");if(group.archived)throw new Error("姿势模板已归档，不能用于新项目");if(!project)throw new Error("商品项目不存在");
  const now=new Date().toISOString(),inputs=group.poses.map(pose=>({id:crypto.randomUUID(),poseIndex:pose.poseIndex,imagePath:pose.referenceImagePath,thumbnailPath:pose.thumbnailPath,description:pose.description,createdAt:now,updatedAt:now}));
  await updateProject(project.id,{selectedPoseTemplateGroupId:group.id,poseTemplateSnapshot:structuredClone(group),poseReferenceInputs:inputs,assets:{...project.assets,poseReferenceImages:group.poses.map(pose=>pose.referenceImagePath)},settings:{...project.settings,pose:{...(project.settings.pose||{mode:"standard",shotType:"全身",face:false,background:true,detailRequirements:"",poseInstructions:group.poses.map(pose=>pose.description||pose.name),sourceMode:project.confirmedTryonImage?"confirmed":"standalone"}),referenceMode:"library",poseInstructions:group.poses.map(pose=>pose.description||pose.name)}}});
  await patchPoseTemplateGroup(id,{usageCount:group.usageCount+1,lastUsedAt:now});return getProject(project.id);
}
