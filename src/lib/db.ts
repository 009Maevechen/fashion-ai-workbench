import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {GenerationMode,GenerationStatus,WorkflowType} from "./ai/types";
import type {ApiProviderType,ModelSlot} from "./ai/provider-settings-types";
import type {ColorAdjustment} from "./color-adjustment";
import type {CorrectionCommandPlan} from "./correction-command";
import {runtimeDataDir,runtimeProjectProcessDir} from "./runtime-paths";
import {findProjectByRouteKey} from "./project-lookup";
import {safeSegment} from "./ai/validators";
import {durableWriteJson,readJsonWithBackups,readValidJson} from "./durable-json";
import {interruptJobs,interruptOperations,reconcileProjects} from "./recovery";

export type ProductType="上衣"|"裤装"|"连衣裙"|"半身裙"|"套装";
export type PoseShotType="full_body"|"half_body"|"upper_body"|"lower_body";
export type PoseFaceMode="visible"|"hidden"|"either";
export type PoseReferenceInput={id:string;poseIndex:1|2|3;imagePath:string;thumbnailPath?:string;description?:string;createdAt:string;updatedAt:string};
export type PoseTemplateItem={id:string;poseIndex:1|2|3;name:string;description?:string;referenceImagePath:string;thumbnailPath?:string;sourceProjectId?:string;sourceImagePath?:string;imageHash:string;perceptualHash:string;poseSignature?:string};
export type PoseTemplateGroup={id:string;name:string;description?:string;productTypes:ProductType[];shotType:PoseShotType;faceMode:PoseFaceMode;styleTags:string[];platformTags:string[];displayFocus:string[];favorite:boolean;archived:boolean;usageCount:number;createdAt:string;updatedAt:string;lastUsedAt?:string;sourceProjectId?:string;poses:[PoseTemplateItem,PoseTemplateItem,PoseTemplateItem]};
export type StepStatus="not_started"|"ready"|"generating"|"partial_success"|"awaiting_confirmation"|"confirmed"|"failed"|"stale"|"completed";
export type DependencyStatus="current"|"stale"|"needs_review";
export type ProjectAssets={garmentImage?:string;garmentCropImage?:string;garmentCropRegion?:{x:number;y:number;width:number;height:number};productFrontImage?:string;productBackImage?:string;productDetailImage?:string;printCloseupImage?:string;buttonCloseupImage?:string;modelReferenceImage?:string;fabricTextureImage?:string;otherMaterialImages?:string[];modelImage?:string;standalonePoseInputImage?:string;poseReferenceImages?:string[];colorReferenceImage?:string;colorReferenceCropImage?:string;colorReferenceCropRegion?:{x:number;y:number;width:number;height:number};standaloneRecolorPoseImages?:string[]};
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
export type TargetColor={id:string;name:string;outputName?:string;baseHex?:string;hex?:string;trimColorName?:string;trimHex?:string;colorAdjustment?:ColorAdjustment;designDetails?:string[];materialFeatures?:string;designConfidence?:number;designNeedsReview?:boolean;cropImage?:string;cropRegion?:{x:number;y:number;width:number;height:number};status:"draft"|"ready"|"generating"|"partial_success"|"success"|"failed"|"confirmed"|"stale";generationStartedAt?:string;poseResults?:string[];sourceCount?:number;protectedAreas?:string[]};
export type TryonRevisionMessage={id:string;role:"user"|"assistant";content:string;createdAt:string};
export type WorkflowSettings={workflowSkus?:Partial<Record<WorkflowType,string>>;tryon?:{mode:GenerationMode;candidateCount:number;productType?:ProductType;garmentDescription:string;detailRequirements:string;extraRequirements?:string;protectedItems:string[];face?:boolean;selectedCandidateImage?:string;activeCandidateSlot?:number;revisionRequest?:string;revisionMessages?:TryonRevisionMessage[]};pose?:{mode:GenerationMode;productType?:ProductType;shotType:string;face:boolean;background:boolean;detailRequirements:string;poseInstructions:string[];referenceAnalyses?:PoseReferenceAnalysis[];sourceMode:"confirmed"|"standalone";referenceMode?:"library"|"upload";selectedResultImages?:string[];focus?:""|"upper"|"lower"};recolor?:{mode:GenerationMode;garmentArea:string;protectedAreas:string[];extraRequirements:string;activeColorId?:string;sourceMode:"confirmed"|"standalone";face?:boolean;colorsLocked?:boolean;selectedBatchColorIds?:string[];withModelImage?:boolean;recolorMode?:"uniform"|"perVariant"};[key:string]:unknown};
export type Project={id:string;sku:string;productName:string;productType:ProductType;currentStep:number;status:string;createdAt:string;updatedAt:string;confirmedTryonImage?:string;confirmedPoseImages?:string[];confirmedRecolorImages?:string[];assets:ProjectAssets;assetEvidence?:Partial<Record<ProductDetailAssetKey|"garmentImage",ProductAssetEvidence>>;productVisualAnalysis?:ProductVisualAnalysis;profile?:ProductProfile;settings:WorkflowSettings;stepStatuses?:Record<string,StepStatus>;dependencyStatus?:DependencyStatus;targetColors?:TargetColor[];poseReferenceInputs?:PoseReferenceInput[];selectedPoseTemplateGroupId?:string;poseTemplateSnapshot?:PoseTemplateGroup;poseReviewStates?:Record<string,"pending"|"approved"|"redo">};
export type JobPhase="queued"|"uploading"|"submitting"|"waiting_provider"|"downloading"|"validating"|"optimizing"|"saving"|"success"|"failed"|"interrupted";
export type GarmentConsistencyCheck={status:"passed"|"needs_review"|"failed";score?:number;summary:string;issues:string[];checkedAt:string;model?:string;checks?:{silhouette?:boolean;material?:boolean;texture?:boolean;construction?:boolean;details?:boolean;color?:boolean}};
export type TryonSubjectFidelityCheck={status:"passed"|"needs_review"|"failed";basedOnModel:boolean;poseMatch:boolean;shotMatch:boolean;closerToProduct:boolean;originalGarmentLeak:boolean;skinQualityMatch:boolean;score:number;summary:string;issues:string[];checkedAt:string;model?:string};
export type CorrectionInstructionCheck={passed:boolean;score:number;summary:string;missed:string[];violations:string[];checkedAt:string;model?:string};
export type Job={id:string;projectId:string;sku:string;workflow:WorkflowType;provider:string;providerId?:string;providerType?:ApiProviderType|string;model:string;modelSlot?:ModelSlot;mode:GenerationMode;inputImages:string[];outputImages:string[];promptVersion:string;status:GenerationStatus;requestStatus?:GenerationStatus;phase?:JobPhase;dependencyStatus?:DependencyStatus;startedAt:string;requestStartedAt?:string;finishedAt?:string;requestFinishedAt?:string;error?:string;errorMessage?:string;slot?:number;poseIndex?:number;poseInstruction?:string;poseReferenceImage?:string;sourceModelImage?:string;durationMs?:number;targetColorId?:string;colorName?:string;batchId?:string;consistencyCheck?:GarmentConsistencyCheck;subjectFidelity?:TryonSubjectFidelityCheck;correctionPlan?:CorrectionCommandPlan;correctionCheck?:CorrectionInstructionCheck;qualityIssues?:string[];sharpnessScore?:number;inpaint?:InpaintMeta;timing?:JobTiming};
export type JobTiming={queuedMs?:number;preprocessMs?:number;apiMs?:number;downloadMs?:number;localMs?:number;totalMs?:number};
export type InpaintMeta={sourceImageId:string;sourceStep:WorkflowType;sourceUrl:string;maskUrl:string;editPrompt:string};
export type OperationStatus="queued"|"running"|"success"|"failed"|"interrupted";
export type Operation={id:string;projectId:string;workflow:WorkflowType;status:OperationStatus;payload:unknown;jobIds:string[];createdAt:string;updatedAt:string;error?:string};
export type Store={schemaVersion:number;projects:Project[];jobs:Job[];operations:Operation[];poseTemplateGroups:PoseTemplateGroup[]};

const dataDir=runtimeDataDir(),file=path.join(dataDir,"store.json"),legacyBackup=path.join(dataDir,"store.backup.json"),backups=[1,2,3].map(index=>path.join(dataDir,`store.backup-${index}.json`));let queue=Promise.resolve();
const SCHEMA_VERSION=2;
const normalizeStore=(parsed:Partial<Store>):Store=>({schemaVersion:SCHEMA_VERSION,projects:parsed.projects||[],jobs:parsed.jobs||[],operations:parsed.operations||[],poseTemplateGroups:parsed.poseTemplateGroups||[]});
const defaults=():Store=>({schemaVersion:SCHEMA_VERSION,projects:[],jobs:[],operations:[],poseTemplateGroups:[]});
const isStore=(value:unknown):value is Store=>{const item=value as Partial<Store>|null;return Boolean(item&&Array.isArray(item.projects)&&Array.isArray(item.jobs)&&Array.isArray(item.operations)&&Array.isArray(item.poseTemplateGroups))};
type PersistenceRuntime=typeof globalThis&{__workbenchRecoveredBackup?:string;__workbenchPersistenceError?:string};
const persistenceRuntime=globalThis as PersistenceRuntime;
async function load():Promise<Store>{try{const loaded=await readJsonWithBackups(file,[...backups,legacyBackup],isStore);if(!loaded)return defaults();if(loaded.source!==file){persistenceRuntime.__workbenchRecoveredBackup=path.basename(loaded.source);await durableWriteJson(file,loaded.value)}return normalizeStore(loaded.value)}catch(error){const message=error instanceof Error?error.message:"未知数据错误";persistenceRuntime.__workbenchPersistenceError=message;throw new Error(`项目数据损坏且所有备份均不可用：${message}`)}}
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
async function persistProjectProcessFiles(store:Store,projectIds?:string[]){
  const root=runtimeProjectProcessDir();
  const selected=projectIds?store.projects.filter(project=>projectIds.includes(project.id)):store.projects;
  for(const project of selected){
    const directory=path.resolve(root,safeSegment(project.sku));
    if(!directory.startsWith(root+path.sep))throw new Error("非法商品流程目录");
    await fs.mkdir(directory,{recursive:true});
    const target=path.join(directory,"project-process.json"),temporary=`${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const snapshot={schemaVersion:SCHEMA_VERSION,savedAt:new Date().toISOString(),project,jobs:store.jobs.filter(job=>job.projectId===project.id),operations:store.operations.filter(operation=>operation.projectId===project.id)};
    try{await durableWriteJson(temporary,snapshot);await replaceStoreFile(temporary,target)}finally{await fs.unlink(temporary).catch(()=>{})}
  }
}
async function rotateBackups(){await fs.copyFile(backups[1],backups[2]).catch(()=>{});await fs.copyFile(backups[0],backups[1]).catch(()=>{});try{const current=await readValidJson(file,isStore);await durableWriteJson(backups[0],current)}catch{}}
async function mutate<T>(fn:(s:Store)=>T|Promise<T>,affectedProjectIds?:string[]|(()=>string[])){let result!:T;queue=queue.then(async()=>{const s=await load();result=await fn(s);await fs.mkdir(dataDir,{recursive:true});await rotateBackups();await durableWriteJson(file,s);const affected=typeof affectedProjectIds==="function"?affectedProjectIds():affectedProjectIds;await persistProjectProcessFiles(s,affected)});await queue;return result}
export function persistenceStatus(){return {recovered:Boolean(persistenceRuntime.__workbenchRecoveredBackup||process.env.AI_STUDIO_RECOVERED==="1"),backup:persistenceRuntime.__workbenchRecoveredBackup,error:persistenceRuntime.__workbenchPersistenceError}}
const normalize=(p:Project):Project=>({...p,assets:p.assets||{},profile:p.profile||{reviewStatus:"draft",tags:[],attributes:{}},settings:p.settings||{},stepStatuses:p.stepStatuses||{"1":"ready","2":"not_started","3":"not_started","4":"not_started","5":"not_started"},dependencyStatus:p.dependencyStatus||"current",targetColors:p.targetColors||[],poseReferenceInputs:p.poseReferenceInputs||[],poseReviewStates:p.poseReviewStates||{}});
export const listProjects=async()=>{const s=await load();return s.projects.map(normalize).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};
// 项目页面地址既接受内部 ID，也接受用户可见的 SKU；这样复制地址或刷新 SKU 路径不会 404。
export const getProject=async(idOrSku:string)=>{const p=findProjectByRouteKey((await load()).projects,idOrSku);return p?normalize(p):undefined};
export const createProject=(v:Pick<Project,"sku"|"productName"|"productType">)=>mutate(s=>{const sku=v.sku.trim();if(!sku)throw new Error("SKU 不能为空");const normalized=sku.toLocaleLowerCase();const duplicate=s.projects.find(x=>x.sku.trim().toLocaleLowerCase()===normalized);if(duplicate)throw new Error(`SKU「${duplicate.sku}」已存在（商品名称：${duplicate.productName||"未命名"}），请换一个货号`);const now=new Date().toISOString();const p:Project={...v,sku,id:crypto.randomUUID(),currentStep:1,status:"未开始",createdAt:now,updatedAt:now,assets:{},settings:{},stepStatuses:{"1":"ready","2":"not_started","3":"not_started","4":"not_started","5":"not_started"},dependencyStatus:"current",targetColors:[]};s.projects.push(p);return p});
export const updateProject=(id:string,patch:Partial<Project>)=>mutate(s=>{const p=s.projects.find(x=>x.id===id);if(!p)throw new Error("商品项目不存在");Object.assign(p,patch,{id:p.id,updatedAt:new Date().toISOString()});return normalize(p)},[id]);
export const updateProjectWith=(id:string,updater:(project:Project)=>Partial<Project>)=>mutate(s=>{const p=s.projects.find(x=>x.id===id);if(!p)throw new Error("商品项目不存在");const patch=updater(normalize(p));Object.assign(p,patch,{id:p.id,updatedAt:new Date().toISOString()});return normalize(p)},[id]);
export const deleteProject=(id:string)=>mutate(s=>{s.projects=s.projects.filter(x=>x.id!==id);s.jobs=s.jobs.filter(x=>x.projectId!==id);s.operations=s.operations.filter(x=>x.projectId!==id)});
export const listJobs=async(filters?:{sku?:string;workflow?:string;projectId?:string})=>{let j=(await load()).jobs;if(filters?.sku)j=j.filter(x=>x.sku.includes(filters.sku!));if(filters?.workflow)j=j.filter(x=>x.workflow===filters.workflow);if(filters?.projectId)j=j.filter(x=>x.projectId===filters.projectId);return j.sort((a,b)=>b.startedAt.localeCompare(a.startedAt))};
export const addJob=(job:Job)=>mutate(s=>{s.jobs.push(job);return job},[job.projectId]);
export const patchJob=(id:string,patch:Partial<Job>)=>{let projectId="";return mutate(s=>{const j=s.jobs.find(x=>x.id===id);if(!j)throw new Error("任务不存在");projectId=j.projectId;Object.assign(j,patch,{id:j.id});return j},()=>projectId?[projectId]:[])};
export const getJob=async(id:string)=>(await load()).jobs.find(x=>x.id===id);
export const deleteWorkflowRecords=(projectId:string,workflow:WorkflowType)=>mutate(s=>{const jobIds=new Set(s.jobs.filter(job=>job.projectId===projectId&&job.workflow===workflow).map(job=>job.id));s.jobs=s.jobs.filter(job=>!jobIds.has(job.id));s.operations=s.operations.filter(operation=>!(operation.projectId===projectId&&operation.workflow===workflow));return jobIds.size});
export const markInterruptedJobs=()=>mutate(s=>{const count=interruptJobs(s.jobs);if(count)persistenceRuntime.__workbenchRecoveredBackup=persistenceRuntime.__workbenchRecoveredBackup||"unfinished-tasks";return count});
export const addOperation=(operation:Operation)=>mutate(s=>{s.operations.push(operation);return operation},[operation.projectId]);
export const getOperation=async(id:string)=>(await load()).operations.find(x=>x.id===id);
export const patchOperation=(id:string,patch:Partial<Operation>)=>{let projectId="";return mutate(s=>{const operation=s.operations.find(x=>x.id===id);if(!operation)throw new Error("本地任务不存在");projectId=operation.projectId;Object.assign(operation,patch,{id:operation.id,updatedAt:new Date().toISOString()});return operation},()=>projectId?[projectId]:[])};
export const listOperations=async(projectId?:string)=>{const operations=(await load()).operations;return (projectId?operations.filter(x=>x.projectId===projectId):operations).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))};
export const markInterruptedOperations=()=>mutate(s=>{const count=interruptOperations(s.operations);if(count)persistenceRuntime.__workbenchRecoveredBackup=persistenceRuntime.__workbenchRecoveredBackup||"unfinished-tasks";return count});
export const reconcileGeneratingProjects=()=>mutate(s=>reconcileProjects(s.projects,s.operations));
// 暂停某个项目工作流的生图：把排队中/运行中的操作与未完成任务标记为中断，并对账项目状态。
export const cancelWorkflowGeneration=(projectId:string,workflow:WorkflowType)=>mutate(s=>{const now=new Date().toISOString();let jobs=0,operations=0;for(const op of s.operations)if(op.projectId===projectId&&op.workflow===workflow&&(op.status==="queued"||op.status==="running")){op.status="interrupted";op.error="任务已被用户取消";op.updatedAt=now;operations++}for(const job of s.jobs)if(job.projectId===projectId&&job.workflow===workflow&&job.phase&&!["success","failed","interrupted"].includes(job.phase)){job.phase="interrupted";job.status="interrupted";job.requestStatus="interrupted";job.error="任务已被用户取消";job.errorMessage="任务已被用户取消";job.finishedAt=now;jobs++}reconcileProjects(s.projects,s.operations,now);return {jobs,operations}});
// 清空某个项目工作流的错误生图内容：只删除失败/中断的任务，保留成功结果与上传素材。
export const clearWorkflowErrors=(projectId:string,workflow:WorkflowType)=>mutate(s=>{const ids=s.jobs.filter(job=>job.projectId===projectId&&job.workflow===workflow&&(job.status==="failed"||job.status==="interrupted")).map(job=>job.id);s.jobs=s.jobs.filter(job=>!ids.includes(job.id));return ids.length});
export const listPoseTemplateGroups=async()=>[...(await load()).poseTemplateGroups].sort((a,b)=>(b.lastUsedAt||b.updatedAt).localeCompare(a.lastUsedAt||a.updatedAt));
export const getPoseTemplateGroup=async(id:string)=>(await load()).poseTemplateGroups.find(group=>group.id===id);
export const addPoseTemplateGroup=(group:PoseTemplateGroup)=>mutate(s=>{if(s.poseTemplateGroups.some(item=>item.id===group.id))throw new Error("姿势模板组已存在");s.poseTemplateGroups.push(group);return group});
export const patchPoseTemplateGroup=(id:string,patch:Partial<PoseTemplateGroup>)=>mutate(s=>{const group=s.poseTemplateGroups.find(item=>item.id===id);if(!group)throw new Error("姿势模板组不存在");Object.assign(group,patch,{id:group.id,updatedAt:new Date().toISOString()});return group});
export const removePoseTemplateGroup=(id:string)=>mutate(s=>{const group=s.poseTemplateGroups.find(item=>item.id===id);if(!group)throw new Error("姿势模板组不存在");s.poseTemplateGroups=s.poseTemplateGroups.filter(item=>item.id!==id);return group});
