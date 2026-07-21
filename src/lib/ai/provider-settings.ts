import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {getModel} from "./config";
import type {GenerationMode,WorkflowType} from "./types";
import type {ApiProviderPublic,ApiProviderSecretRecord,ApiProviderType,ModelSlot,ProviderRuntimeConfig,ProviderTestStatus,WorkflowModelBindings,WorkflowModelSelection,WorkflowRuntimeModel,WorkflowRuntimeSummary} from "./provider-settings-types";
import {EMPTY_WORKFLOW_BINDINGS} from "./provider-settings-types";

type SettingsStore={version:1;apiProviders:ApiProviderSecretRecord[];workflowModelBindings:WorkflowModelBindings};
type ProviderInput={name:string;type:ApiProviderType;baseUrl:string;apiKey?:string;defaultModel:string;enabled?:boolean;notes?:string};

const dataDir=path.join(process.cwd(),"data");
const settingsFile=path.join(dataDir,"model-settings.json");
const keyFile=path.join(dataDir,".provider-settings.key");
let mutationQueue=Promise.resolve();

const defaults=():SettingsStore=>({version:1,apiProviders:[],workflowModelBindings:structuredClone(EMPTY_WORKFLOW_BINDINGS)});
const cleanBindings=(value?:Partial<WorkflowModelBindings>):WorkflowModelBindings=>({tryon:{...(value?.tryon||{})},pose:{...(value?.pose||{})},recolor:{...(value?.recolor||{})}});

async function loadStore():Promise<SettingsStore>{
  try{
    const parsed=JSON.parse(await fs.readFile(settingsFile,"utf8")) as Partial<SettingsStore>;
    return {version:1,apiProviders:Array.isArray(parsed.apiProviders)?parsed.apiProviders:[],workflowModelBindings:cleanBindings(parsed.workflowModelBindings)};
  }catch(error){
    if((error as NodeJS.ErrnoException).code!=="ENOENT")console.error("模型设置文件无法读取，将使用空配置");
    return defaults();
  }
}

async function mutate<T>(fn:(store:SettingsStore)=>T|Promise<T>){
  let result!:T;
  mutationQueue=mutationQueue.then(async()=>{
    const store=await loadStore();result=await fn(store);
    await fs.mkdir(dataDir,{recursive:true});
    const temporary=`${settingsFile}.tmp`;
    await fs.writeFile(temporary,JSON.stringify(store,null,2),{mode:0o600});
    await fs.rename(temporary,settingsFile);
  });
  await mutationQueue;return result;
}

async function encryptionKey(){
  const configured=process.env.PROVIDER_SETTINGS_SECRET?.trim();
  if(configured)return crypto.createHash("sha256").update(configured).digest();
  try{return Buffer.from((await fs.readFile(keyFile,"utf8")).trim(),"base64")}catch{
    const key=crypto.randomBytes(32);await fs.mkdir(dataDir,{recursive:true});await fs.writeFile(keyFile,key.toString("base64"),{mode:0o600});return key;
  }
}

async function encrypt(secret:string){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",await encryptionKey(),iv),body=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);return ["v1",iv.toString("base64"),cipher.getAuthTag().toString("base64"),body.toString("base64")].join(".")}
async function decrypt(payload:string){try{const [version,iv,tag,body]=payload.split(".");if(version!=="v1"||!iv||!tag||!body)throw new Error();const decipher=crypto.createDecipheriv("aes-256-gcm",await encryptionKey(),Buffer.from(iv,"base64"));decipher.setAuthTag(Buffer.from(tag,"base64"));return Buffer.concat([decipher.update(Buffer.from(body,"base64")),decipher.final()]).toString("utf8")}catch{throw new Error("API Key 无法解密，请重新编辑该提供商并填写密钥")}}
function maskKey(key:string){if(!key)return "未配置";if(key.length<=8)return `${key.slice(0,2)}••••${key.slice(-2)}`;return `${key.slice(0,4)}••••••${key.slice(-4)}`}
function publicProvider(record:ApiProviderSecretRecord):ApiProviderPublic{return {id:record.id,name:record.name,type:record.type,baseUrl:record.baseUrl,apiKeyMasked:record.apiKeyMasked,hasApiKey:Boolean(record.encryptedApiKey),defaultModel:record.defaultModel,enabled:record.enabled,notes:record.notes,lastTestStatus:record.lastTestStatus,lastTestAt:record.lastTestAt,lastError:record.lastError,createdAt:record.createdAt,updatedAt:record.updatedAt}}
function validateUrl(raw:string){if(!raw.trim())throw new Error("Base URL 不能为空");let url:URL;try{url=new URL(raw.trim())}catch{throw new Error("Base URL 不是有效网址")}if(!["https:","http:"].includes(url.protocol))throw new Error("Base URL 只支持 HTTP 或 HTTPS");if(url.protocol==="http:"&&!['127.0.0.1','localhost','::1'].includes(url.hostname))throw new Error("非本机 API 必须使用 HTTPS");if(url.username||url.password)throw new Error("Base URL 不得包含账号或密码");return url.toString().replace(/\/$/,"")}
function validateInput(input:ProviderInput,requireKey=true){if(!input.name.trim())throw new Error("配置名称不能为空");if(!input.defaultModel.trim())throw new Error("默认模型不能为空");if(requireKey&&!input.apiKey?.trim())throw new Error("API Key 不能为空");return {...input,name:input.name.trim(),baseUrl:validateUrl(input.baseUrl),defaultModel:input.defaultModel.trim(),notes:input.notes?.trim()||undefined}}

export async function listApiProviders(){return (await loadStore()).apiProviders.map(publicProvider)}
export async function getApiProvider(id:string){const record=(await loadStore()).apiProviders.find(item=>item.id===id);return record?publicProvider(record):undefined}
export async function createApiProvider(input:ProviderInput){const value=validateInput(input);const now=new Date().toISOString(),key=input.apiKey!.trim();return mutate(async store=>{const record:ApiProviderSecretRecord={id:crypto.randomUUID(),name:value.name,type:value.type,baseUrl:value.baseUrl,encryptedApiKey:await encrypt(key),apiKeyMasked:maskKey(key),defaultModel:value.defaultModel,enabled:value.enabled??true,notes:value.notes,lastTestStatus:"untested",createdAt:now,updatedAt:now};store.apiProviders.push(record);return publicProvider(record)})}
export async function updateApiProvider(id:string,input:Partial<ProviderInput>){return mutate(async store=>{const record=store.apiProviders.find(item=>item.id===id);if(!record)throw new Error("API 提供商不存在");const merged=validateInput({name:input.name??record.name,type:input.type??record.type,baseUrl:input.baseUrl??record.baseUrl,apiKey:input.apiKey,defaultModel:input.defaultModel??record.defaultModel,enabled:input.enabled??record.enabled,notes:input.notes??record.notes},false);record.name=merged.name;record.type=merged.type;record.baseUrl=merged.baseUrl;record.defaultModel=merged.defaultModel;record.enabled=merged.enabled??record.enabled;record.notes=merged.notes;if(input.apiKey?.trim()){record.encryptedApiKey=await encrypt(input.apiKey.trim());record.apiKeyMasked=maskKey(input.apiKey.trim())}if(!record.enabled)for(const workflow of ["tryon","pose","recolor"] as const){if(store.workflowModelBindings[workflow].primary?.providerId===id)delete store.workflowModelBindings[workflow].primary;if(store.workflowModelBindings[workflow].fallback?.providerId===id)delete store.workflowModelBindings[workflow].fallback}record.updatedAt=new Date().toISOString();record.lastTestStatus="untested";record.lastError=undefined;return publicProvider(record)})}
export async function deleteApiProvider(id:string){return mutate(store=>{const exists=store.apiProviders.some(item=>item.id===id);if(!exists)throw new Error("API 提供商不存在");store.apiProviders=store.apiProviders.filter(item=>item.id!==id);for(const workflow of ["tryon","pose","recolor"] as const){const binding=store.workflowModelBindings[workflow];if(binding.primary?.providerId===id)delete binding.primary;if(binding.fallback?.providerId===id)delete binding.fallback}return true})}
export async function updateProviderTestResult(id:string,status:ProviderTestStatus,error?:string){return mutate(store=>{const record=store.apiProviders.find(item=>item.id===id);if(!record)throw new Error("API 提供商不存在");record.lastTestStatus=status;record.lastTestAt=new Date().toISOString();record.lastError=error;record.updatedAt=record.lastTestAt;return publicProvider(record)})}
export async function getWorkflowModelBindings(){return cleanBindings((await loadStore()).workflowModelBindings)}
function validSelection(value:unknown):WorkflowModelSelection|undefined{if(!value||typeof value!=="object")return;const item=value as Partial<WorkflowModelSelection>;if(!item.providerId?.trim()||!item.model?.trim())return;return {providerId:item.providerId.trim(),model:item.model.trim()}}
export async function saveWorkflowModelBindings(input:Partial<WorkflowModelBindings>){return mutate(store=>{const providerIds=new Set(store.apiProviders.filter(item=>item.enabled).map(item=>item.id));const next=cleanBindings(input);for(const workflow of ["tryon","pose","recolor"] as const){for(const slot of ["primary","fallback"] as const){const selection=validSelection(next[workflow][slot]);if(!selection){delete next[workflow][slot];continue}if(!providerIds.has(selection.providerId))throw new Error(`${workflow} 的${slot==="primary"?"主":"备用"}提供商不存在或未启用`);next[workflow][slot]=selection}}store.workflowModelBindings=next;return cleanBindings(next)})}

export async function getProviderRuntime(id:string,model?:string):Promise<ProviderRuntimeConfig>{const record=(await loadStore()).apiProviders.find(item=>item.id===id);if(!record)throw new Error("绑定的 API 提供商不存在");if(!record.enabled)throw new Error(`API 提供商“${record.name}”未启用`);const selectedModel=model?.trim()||record.defaultModel;if(!selectedModel)throw new Error(`API 提供商“${record.name}”没有配置模型名称`);if(!record.baseUrl)throw new Error(`API 提供商“${record.name}”没有配置 Base URL`);if(!record.encryptedApiKey)throw new Error(`API 提供商“${record.name}”没有配置 API Key`);return {id:record.id,name:record.name,type:record.type,baseUrl:record.baseUrl,apiKey:await decrypt(record.encryptedApiKey),model:selectedModel,source:"stored"}}

function environmentRuntime(workflow:WorkflowType,mode:GenerationMode):ProviderRuntimeConfig{const choice=getModel(workflow,mode),type=choice.provider as ApiProviderType;const map:Record<string,{name:string;baseUrl:string;apiKey:string}>={bfl:{name:"BFL",baseUrl:process.env.BFL_API_BASE_URL||"https://api.bfl.ai",apiKey:process.env.BFL_API_KEY||""},fashn:{name:"FASHN",baseUrl:process.env.FASHN_API_BASE_URL||"https://api.fashn.ai/v1",apiKey:process.env.FASHN_API_KEY||""},volcengine:{name:"火山方舟",baseUrl:process.env.VOLCENGINE_API_BASE_URL||"https://ark.cn-beijing.volces.com/api/v3",apiKey:process.env.VOLCENGINE_API_KEY||""},flux:{name:"FLUX",baseUrl:process.env.FLUX_API_BASE_URL||"",apiKey:process.env.FLUX_API_KEY||""},custom:{name:"自定义图像 API",baseUrl:process.env.CUSTOM_IMAGE_API_ENDPOINT||"",apiKey:process.env.CUSTOM_IMAGE_API_KEY||""}};const item=map[choice.provider];if(!item?.apiKey)throw new Error(`${item?.name||choice.provider} API Key 未配置`);if(!item.baseUrl)throw new Error(`${item.name} Base URL 未配置`);return {id:`environment:${choice.provider}`,name:item.name,type,baseUrl:item.baseUrl,apiKey:item.apiKey,model:choice.model,source:"environment"}}
export async function resolveWorkflowModel(workflow:WorkflowType,mode:GenerationMode,slot:ModelSlot="primary"){const bindings=await getWorkflowModelBindings(),selection=bindings[workflow][slot];if(selection)return getProviderRuntime(selection.providerId,selection.model);if(slot==="fallback")throw new Error(`${workflow==="tryon"?"服装换装":workflow==="pose"?"三种姿势":"服装复色"}尚未配置备用模型`);return environmentRuntime(workflow,mode)}

async function runtimeSummary(workflow:WorkflowType,slot:ModelSlot):Promise<WorkflowRuntimeModel>{try{const bindings=await getWorkflowModelBindings(),selection=bindings[workflow][slot];if(slot==="fallback"&&!selection)return {slot,configured:false,providerName:"未配置",providerType:"",model:"",source:"none"};const runtime=await resolveWorkflowModel(workflow,"standard",slot);return {slot,configured:true,providerId:runtime.id,providerName:runtime.name,providerType:runtime.type,model:runtime.model,source:runtime.source}}catch(error){return {slot,configured:false,providerName:"未配置",providerType:"",model:"",source:"none",error:error instanceof Error?error.message:"模型配置不可用"}}}
export async function getWorkflowRuntimeSummary():Promise<WorkflowRuntimeSummary>{const entries=await Promise.all((["tryon","pose","recolor"] as const).map(async workflow=>[workflow,{primary:await runtimeSummary(workflow,"primary"),fallback:await runtimeSummary(workflow,"fallback")}] as const));return Object.fromEntries(entries) as WorkflowRuntimeSummary}
