import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {GenerationMode,GenerationStatus,WorkflowType} from "./ai/types";
import type {ApiProviderType,ModelSlot} from "./ai/provider-settings-types";
import type {ColorAdjustment} from "./color-adjustment";
import {runtimeDataDir,runtimeProjectProcessDir} from "./runtime-paths";
import {findProjectByRouteKey} from "./project-lookup";
import {safeSegment} from "./ai/validators";

export type ProductType="上衣"|"裤装"|"连衣裙"|"半身裙"|"套装";
export type PoseShotType="full_body"|"half_body"|"upper_body"|"lower_body";
export type PoseFaceMode="visible"|"hidden"|"either";
export type PoseReferenceInput={id:string;poseIndex:1|2|3;imagePath:string;thumbnailPath?:string;description?:string;createdAt:string;updatedAt:string};
export type PoseTemplateItem={id:string;poseIndex:1|2|3;name:string;description?:string;referenceImagePath:string;thumbnailPath?:string;sourceProjectId?:string;sourceImagePath?:string;imageHash:string;perceptualHash:string;poseSignature?:string};
export type PoseTemplateGroup={id:string;name:string;description?:string;productTypes:ProductType[];shotType:PoseShotType;faceMode:PoseFaceMode;styleTags:string[];platformTags:string[];displayFocus:string[];favorite:boolean;archived:boolean;usageCount:number;createdAt:string;updatedAt:string;lastUsedAt?:string;sourceProjectId?:string;poses:[PoseTemplateItem,PoseTemplateItem,PoseTemplateItem]};
export type StepStatus="not_started"|"ready"|"generating"|"partial_success"|"awaiting_confirmation"|"confirmed"|"failed"|"stale"|"completed";
export type DependencyStatus="current"|"stale"|"needs_review";
export type ProjectAssets={garmentImage?:string;productFrontImage?:string;productBackImage?:string;productDetailImage?:string;printCloseupImage?:string;buttonCloseupImage?:string;modelReferenceImage?:string;fabricTextureImage?:string;otherMaterialImages?:string[];modelImage?:string;standalonePoseInputImage?:string;poseReferenceImages?:string[];colorReferenceImage?:string;colorReferenceCropImage?:string;colorReferenceCropRegion?:{x:number;y:number;width:number;height:number};standaloneRecolorPoseImages?:string[]};
export type ProductAttributes={mainColor?:string;printType?:string;neckline?:string;sleeveType?:string;garmentLength?:string;fit?:string;fabric?:string;fabricTexture?:string;weaveStructure?:string;gradientDesign?:string;colorBlockLayout?:string;specialDesign?:string;placketType?:string;buttonCount?:string;pocketDetails?:string;trimColor?:string;printPosition?:string;asymmetry?:string;belt?:string;drawstring?:string;pleats?:string;slit?:string;transparency?:string;lining?:string;elasticity?:string};
export type ProductDetailAssetKey="productFrontImage"|"productBackImage"|"productDetailImage"|"printCloseupImage"|"buttonCloseupImage"|"modelReferenceImage"|"fabricTextureImage"|"colorReferenceImage";
export type NormalizedCropRegion={x:number;y:number;width:number;height:number};
export type ProductDetailRegionType="frontView"|"backView"|"detail"|"print"|"buttons"|"fabric"|"multiColor"|"modelReference";
export type ProductVisualRegion={id:string;type:ProductDetailRegionType;label:string;confidence:number;boundingBox:NormalizedCropRegion;cropPath:string;upscalePath:string;assetKey:ProductDetailAssetKey;needsReview:boolean;reason:string;scale:2|4};
export type ProductMissingDetail={type:ProductDetailRegionType;label:string;reason:string};
export type ProductAttributeEvidence={value:string;confidence:number;needsReview:boolean;reason:string};
export type ProductAssetEvidence={source:"manual"|"ai_crop";sourceImage?:string;confidence?:number;boundingBox?:NormalizedCropRegion;needsReview?:boolean;reason?:string;regionId?:string;createdAt:string};
export type ProductVisualAnalysis={status:"analyzing"|"completed"|"failed";sourceImage:string;sourceWidth?:number;sourceHeight?:number;model?:string;analyzedAt?:string;error?:string;regions:ProductVisualRegion[];missing:ProductMissingDetail[];attributeEvidence?:Partial<Record<keyof ProductAttributes,ProductAttributeEvidence>>;aiFilledAttributeKeys?:Array<keyof ProductAttributes>;suggestedProtectionItems?:string[]};
export type ProductProfile={brand?:string;season?:string;listingDate?:string;owner?:string;priority?:"low"|"normal"|"high"|"urgent";deliveryDate?:string;reviewStatus?:"draft"|"awaiting_review"|"confirmed";notes?:string;detailDescription?:string;tags?:string[];protectionItems?:string[];attributes?:ProductAttributes;manualAttributeKeys?:Array<keyof ProductAttributes>;manualProtectionEdited?:boolean};
export type PoseReferenceAnalysis={referenceImage:string;shotType:"全身"|"上半身"|"下半身";poseDescription:string;framingDescription:string;compositionDescription:string;instruction:string};
export type TargetColor={id:string;name:string;outputName?:string;baseHex?:string;hex?:string;trimColorName?:string;trimHex?:string;colorAdjustment?:ColorAdjustment;cropImage?:string;cropRegion?:{x:number;y:number;width:number;height:number};status:"draft"|"ready"|"generating"|"partial_success"|"success"|"failed"|"confirmed"|"stale";generationStartedAt?:string;poseResults?:string[];sourceCount?:number;protectedAreas?:string[]};
export type TryonRevisionMessage={id:string;role:"user"|"assistant";content:string;createdAt:string};
export type WorkflowSettings={workflowSkus?:Partial<Record<WorkflowType,string>>;tryon?:{mode:GenerationMode;candidateCount:number;productType?:ProductType;garmentDescription:string;detailRequirements:string;extraRequirements?:string;protectedItems:string[];face?:boolean;selectedCandidateImage?:string;activeCandidateSlot?:number;revisionRequest?:string;revisionMessages?:TryonRevisionMessage[]};pose?:{mode:GenerationMode;productType?:ProductType;shotType:string;face:boolean;background:boolean;detailRequirements:string;poseInstructions:string[];referenceAnalyses?:PoseReferenceAnalysis[];sourceMode:"confirmed"|"standalone";referenceMode?:"library"|"upload";selectedResultImages?:string[]};recolor?:{mode:GenerationMode;garmentArea:string;protectedAreas:string[];extraRequirements:string;activeColorId?:string;sourceMode:"confirmed"|"standalone";face?:boolean;colorsLocked?:boolean;selectedBatchColorIds?:string[]};[key:string]:unknown};
export type Project={id:string;sku:string;productName:string;productType:ProductType;currentStep:number;status:string;createdAt:string;updatedAt:string;confirmedTryonImage?:string;confirmedPoseImages?:string[];confirmedRecolorImages?:string[];assets:ProjectAssets;assetEvidence?:Partial<Record<ProductDetailAssetKey|"garmentImage",ProductAssetEvidence>>;productVisualAnalysis?:ProductVisualAnalysis;profile?:ProductProfile;settings:WorkflowSettings;stepStatuses?:Record<string,StepStatus>;dependencyStatus?:DependencyStatus;targetColors?:TargetColor[];poseReferenceInputs?:PoseReferenceInput[];selectedPoseTemplateGroupId?:string;poseTemplateSnapshot?:PoseTemplateGroup;poseReviewStates?:Record<string,"pending"|"approved"|"redo">};
export type JobPhase="queued"|"uploading"|"submitting"|"waiting_provider"|"downloading"|"validating"|"optimizing"|"saving"|"success"|"failed"|"interrupted";
export type GarmentConsistencyCheck={status:"passed"|"needs_review"|"failed";score?:number;summary:string;issues:string[];checkedAt:string;model?:string;checks?:{silhouette?:boolean;material?:boolean;texture?:boolean;construction?:boolean;details?:boolean;color?:boolean}};
export type Job={id:string;projectId:string;sku:string;workflow:WorkflowType;provider:string;providerId?:string;providerType?:ApiProviderType|string;model:string;modelSlot?:ModelSlot;mode:GenerationMode;inputImages:string[];outputImages:string[];promptVersion:string;status:GenerationStatus;requestStatus?:GenerationStatus;phase?:JobPhase;dependencyStatus?:DependencyStatus;startedAt:string;requestStartedAt?:string;finishedAt?:string;requestFinishedAt?:string;error?:string;errorMessage?:string;slot?:number;poseIndex?:number;poseInstruction?:string;poseReferenceImage?:string;sourceModelImage?:string;durationMs?:number;targetColorId?:string;colorName?:string;consistencyCheck?:GarmentConsistencyCheck};
export type OperationStatus="queued"|"running"|"success"|"failed"|"interrupted";
export type Operation={id:string;projectId:string;workflow:WorkflowType;status:OperationStatus;payload:unknown;jobIds:string[];createdAt:string;updatedAt:string;error?:string};
export type Store={schemaVersion:number;projects:Project[];jobs:Job[];operations:Operation[];poseTemplateGroups:PoseTemplateGroup[]};

const dataDir=runtimeDataDir(),file=path.join(dataDir,"store.json"),backup=path.join(dataDir,"store.backup.json");let queue=Promise.resolve();
const SCHEMA_VERSION=2;
const normalizeStore=(parsed:Partial<Store>):Store=>({schemaVersion:SCHEMA_VERSION,projects:parsed.projects||[],jobs:parsed.jobs||[],operations:parsed.operations||[],poseTemplateGroups:parsed.poseTemplateGroups||[]});
const defaults=():Store=>({schemaVersion:SCHEMA_VERSION,projects:[],jobs:[],operations:[],poseTemplateGroups:[]});
async function load():Promise<Store>{try{return normalizeStore(JSON.parse(await fs.readFile(file,"utf8")) as Partial<Store>)}catch(error){try{console.warn("主项目数据无法读取，已尝试从备份恢复");return normalizeStore(JSON.parse(await fs.readFile(backup,"utf8")) as Partial<Store>)}catch{if((error as NodeJS.ErrnoException).code!=="ENOENT")console.error("项目数据损坏，且备份不可用");return defaults()}}}
const wait=(milliseconds:number)=>new Promise<void>(resolve=>setTimeout(resolve,milliseconds));
function isTransientWindowsFileLock(error:unknown){const code=(error as NodeJS.ErrnoException).code;return code==="EPERM"||code==="EACCES"||code==="EBUSY"}
async function replaceStoreFile(tmp:string,target:string){
  let lastError:unknown;
  for(let attempt=0;attempt<6;attempt++){
    try{await fs.rename(tmp,target);return}catch(error){
      lastError=error;
      if(!isTransientWindowsFileLock(error)||attempt===5)throw error;
      // Windows Defender、OneDrive 和文件索引器可能会短暂占用刚写入的 JSON。
      await wait(40*(2**attempt));
    }
  }
  throw lastError;
}
async function persistProjectProcessFiles(store:Store){
  const root=runtimeProjectProcessDir();
  await Promise.all(store.projects.map(async project=>{
    const directory=path.resolve(root,safeSegment(project.sku));
    if(!directory.startsWith(root+path.sep))throw new Error("非法商品流程目录");
    await fs.mkdir(directory,{recursive:true});
    const target=path.join(directory,"project-process.json"),temporary=`${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const snapshot={schemaVersion:SCHEMA_VERSION,savedAt:new Date().toISOString(),project,jobs:store.jobs.filter(job=>job.projectId===project.id),operations:store.operations.filter(operation=>operation.projectId===project.id)};
    try{await fs.writeFile(temporary,JSON.stringify(snapshot,null,2));await replaceStoreFile(temporary,target)}finally{await fs.unlink(temporary).catch(()=>{})}
  }));
}
async function mutate<T>(fn:(s:Store)=>T|Promise<T>){let result!:T;queue=queue.then(async()=>{const s=await load();result=await fn(s);await fs.mkdir(dataDir,{recursive:true});try{await fs.copyFile(file,backup)}catch{}const tmp=path.join(dataDir,`store.${process.pid}.${crypto.randomUUID()}.tmp`);try{await fs.writeFile(tmp,JSON.stringify(s,null,2));await replaceStoreFile(tmp,file);await persistProjectProcessFiles(s)}finally{await fs.unlink(tmp).catch(()=>{})}});await queue;return result}
const normalize=(p:Project):Project=>({...p,assets:p.assets||{},profile:p.profile||{reviewStatus:"draft",tags:[],attributes:{}},settings:p.settings||{},stepStatuses:p.stepStatuses||{"1":"ready","2":"not_started","3":"not_started","4":"not_started","5":"not_started"},dependencyStatus:p.dependencyStatus||"current",targetColors:p.targetColors||[],poseReferenceInputs:p.poseReferenceInputs||[],poseReviewStates:p.poseReviewStates||{}});
export const listProjects=async()=>{const s=await load();return s.projects.map(normalize).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};
// 项目页面地址既接受内部 ID，也接受用户可见的 SKU；这样复制地址或刷新 SKU 路径不会 404。
export const getProject=async(idOrSku:string)=>{const p=findProjectByRouteKey((await load()).projects,idOrSku);return p?normalize(p):undefined};
export const createProject=(v:Pick<Project,"sku"|"productName"|"productType">)=>mutate(s=>{const sku=v.sku.trim();if(!sku)throw new Error("SKU 不能为空");const normalized=sku.toLocaleLowerCase();const duplicate=s.projects.find(x=>x.sku.trim().toLocaleLowerCase()===normalized);if(duplicate)throw new Error(`SKU「${duplicate.sku}」已存在（商品名称：${duplicate.productName||"未命名"}），请换一个货号`);const now=new Date().toISOString();const p:Project={...v,sku,id:crypto.randomUUID(),currentStep:1,status:"未开始",createdAt:now,updatedAt:now,assets:{},settings:{},stepStatuses:{"1":"ready","2":"not_started","3":"not_started","4":"not_started","5":"not_started"},dependencyStatus:"current",targetColors:[]};s.projects.push(p);return p});
export const updateProject=(id:string,patch:Partial<Project>)=>mutate(s=>{const p=s.projects.find(x=>x.id===id);if(!p)throw new Error("商品项目不存在");Object.assign(p,patch,{id:p.id,updatedAt:new Date().toISOString()});return normalize(p)});
export const updateProjectWith=(id:string,updater:(project:Project)=>Partial<Project>)=>mutate(s=>{const p=s.projects.find(x=>x.id===id);if(!p)throw new Error("商品项目不存在");const patch=updater(normalize(p));Object.assign(p,patch,{id:p.id,updatedAt:new Date().toISOString()});return normalize(p)});
export const deleteProject=(id:string)=>mutate(s=>{s.projects=s.projects.filter(x=>x.id!==id);s.jobs=s.jobs.filter(x=>x.projectId!==id);s.operations=s.operations.filter(x=>x.projectId!==id)});
export const listJobs=async(filters?:{sku?:string;workflow?:string;projectId?:string})=>{let j=(await load()).jobs;if(filters?.sku)j=j.filter(x=>x.sku.includes(filters.sku!));if(filters?.workflow)j=j.filter(x=>x.workflow===filters.workflow);if(filters?.projectId)j=j.filter(x=>x.projectId===filters.projectId);return j.sort((a,b)=>b.startedAt.localeCompare(a.startedAt))};
export const addJob=(job:Job)=>mutate(s=>{s.jobs.push(job);return job});
export const patchJob=(id:string,patch:Partial<Job>)=>mutate(s=>{const j=s.jobs.find(x=>x.id===id);if(!j)throw new Error("任务不存在");Object.assign(j,patch,{id:j.id});return j});
export const getJob=async(id:string)=>(await load()).jobs.find(x=>x.id===id);
export const deleteWorkflowRecords=(projectId:string,workflow:WorkflowType)=>mutate(s=>{const jobIds=new Set(s.jobs.filter(job=>job.projectId===projectId&&job.workflow===workflow).map(job=>job.id));s.jobs=s.jobs.filter(job=>!jobIds.has(job.id));s.operations=s.operations.filter(operation=>!(operation.projectId===projectId&&operation.workflow===workflow));return jobIds.size});
export const markInterruptedJobs=()=>mutate(s=>{for(const j of s.jobs)if(j.phase&&!["success","failed","interrupted"].includes(j.phase)){j.phase="interrupted";j.status="failed";j.error="服务重启导致任务中断，请重新生成";j.finishedAt=new Date().toISOString()}return true});
export const addOperation=(operation:Operation)=>mutate(s=>{s.operations.push(operation);return operation});
export const getOperation=async(id:string)=>(await load()).operations.find(x=>x.id===id);
export const patchOperation=(id:string,patch:Partial<Operation>)=>mutate(s=>{const operation=s.operations.find(x=>x.id===id);if(!operation)throw new Error("本地任务不存在");Object.assign(operation,patch,{id:operation.id,updatedAt:new Date().toISOString()});return operation});
export const listOperations=async(projectId?:string)=>{const operations=(await load()).operations;return (projectId?operations.filter(x=>x.projectId===projectId):operations).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))};
export const markInterruptedOperations=()=>mutate(s=>{for(const operation of s.operations)if(operation.status==="queued"||operation.status==="running"){operation.status="interrupted";operation.error="服务重启导致任务中断，请重新生成";operation.updatedAt=new Date().toISOString()}return true});
export const reconcileGeneratingProjects=()=>mutate(s=>{const now=new Date().toISOString();for(const project of s.projects){const active=s.operations.some(operation=>operation.projectId===project.id&&(operation.status==="queued"||operation.status==="running"));if(active)continue;const statuses=project.stepStatuses||{};if(project.status==="生成中"||Object.values(statuses).includes("generating")){project.status="生成失败";project.stepStatuses=Object.fromEntries(Object.entries(statuses).map(([step,status])=>[step,status==="generating"?"failed":status]));project.targetColors=(project.targetColors||[]).map(color=>color.status==="generating"?{...color,status:"failed"}:color);project.updatedAt=now}}return true});
export const listPoseTemplateGroups=async()=>[...(await load()).poseTemplateGroups].sort((a,b)=>(b.lastUsedAt||b.updatedAt).localeCompare(a.lastUsedAt||a.updatedAt));
export const getPoseTemplateGroup=async(id:string)=>(await load()).poseTemplateGroups.find(group=>group.id===id);
export const addPoseTemplateGroup=(group:PoseTemplateGroup)=>mutate(s=>{if(s.poseTemplateGroups.some(item=>item.id===group.id))throw new Error("姿势模板组已存在");s.poseTemplateGroups.push(group);return group});
export const patchPoseTemplateGroup=(id:string,patch:Partial<PoseTemplateGroup>)=>mutate(s=>{const group=s.poseTemplateGroups.find(item=>item.id===id);if(!group)throw new Error("姿势模板组不存在");Object.assign(group,patch,{id:group.id,updatedAt:new Date().toISOString()});return group});
export const removePoseTemplateGroup=(id:string)=>mutate(s=>{const group=s.poseTemplateGroups.find(item=>item.id===id);if(!group)throw new Error("姿势模板组不存在");s.poseTemplateGroups=s.poseTemplateGroups.filter(item=>item.id!==id);return group});
