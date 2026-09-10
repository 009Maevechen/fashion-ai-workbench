import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {durableWriteJson} from "./durable-json";
import {runtimeDataDir} from "./runtime-paths";
import type {ProductSkill,ProductSkillInput} from "./product-skill-types";

type ProductSkillStore={schemaVersion:1;skills:ProductSkill[]};
const file=()=>path.join(runtimeDataDir(),"product-skills.json");
let queue=Promise.resolve();

const unique=(items:string[])=>[...new Set(items.map(item=>item.trim()).filter(Boolean))];
function normalizeInput(input:ProductSkillInput):ProductSkillInput{
  const name=input.name.trim();
  if(!name)throw new Error("产品 Skill 名称不能为空");
  if(!input.productTypes.length)throw new Error("至少选择一个适用商品类型");
  if(!input.workflows.length)throw new Error("至少选择一个应用阶段");
  return {...input,name,description:input.description?.trim()||undefined,productTypes:[...new Set(input.productTypes)],workflows:[...new Set(input.workflows)],analysisFocus:unique(input.analysisFocus),protectedDetails:unique(input.protectedDetails),forbiddenChanges:unique(input.forbiddenChanges),riskWarnings:unique(input.riskWarnings),consistencyChecklist:unique(input.consistencyChecklist),promptRules:unique(input.promptRules)};
}
async function load():Promise<ProductSkillStore>{
  try{const parsed=JSON.parse(await fs.readFile(file(),"utf8")) as Partial<ProductSkillStore>;return {schemaVersion:1,skills:Array.isArray(parsed.skills)?parsed.skills:[]}}
  catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw new Error("产品 Skill 配置文件无法读取");return {schemaVersion:1,skills:[]}}
}
async function mutate<T>(work:(store:ProductSkillStore)=>T|Promise<T>){let result!:T;queue=queue.then(async()=>{const store=await load();result=await work(store);await fs.mkdir(runtimeDataDir(),{recursive:true});await durableWriteJson(file(),store)});await queue;return result}

export async function listProductSkills(){return (await load()).skills.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
export async function getProductSkill(id:string){return (await load()).skills.find(skill=>skill.id===id)}
export async function createProductSkill(input:ProductSkillInput){const value=normalizeInput(input),now=new Date().toISOString(),skill:ProductSkill={schemaVersion:1,id:crypto.randomUUID(),...value,description:value.description||undefined,source:value.source||"manual",archived:false,createdAt:now,updatedAt:now};await mutate(store=>{store.skills.push(skill)});return skill}
export async function updateProductSkill(id:string,input:Partial<ProductSkillInput&Pick<ProductSkill,"archived">>){return mutate(store=>{const index=store.skills.findIndex(skill=>skill.id===id);if(index<0)throw new Error("产品 Skill 不存在");const current=store.skills[index],merged=normalizeInput({...current,...input});const updated:ProductSkill={...current,...merged,...(input.archived===undefined?{}:{archived:input.archived}),updatedAt:new Date().toISOString()};store.skills[index]=updated;return updated})}
export async function duplicateProductSkill(id:string){const source=await getProductSkill(id);if(!source)throw new Error("产品 Skill 不存在");return createProductSkill({...source,name:`${source.name} 副本`,enabled:false,source:"manual"})}
