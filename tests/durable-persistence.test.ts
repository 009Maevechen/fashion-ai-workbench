import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {durableWriteJson,readJsonWithBackups,readValidJson} from "../src/lib/durable-json";

test("持久化写入使用完整JSON且不遗留临时文件",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"workbench-durable-")),target=path.join(root,"数据 目录","状态.json");
  try{
    await durableWriteJson(target,{sku:"中文 SKU 01",step:3});
    const value=await readValidJson(target,(item):item is {sku:string;step:number}=>Boolean(item&&typeof item==="object"&&"sku" in item&&"step" in item));
    assert.deepEqual(value,{sku:"中文 SKU 01",step:3});
    assert.deepEqual((await fs.readdir(path.dirname(target))).filter(name=>name.endsWith(".tmp")),[]);
  }finally{await fs.rm(root,{recursive:true,force:true})}
});

test("主状态文件损坏时从最近备份恢复而不是返回空项目",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"workbench-recovery-")),primary=path.join(root,"store.json"),backup=path.join(root,"store.backup-1.json");
  try{
    await fs.writeFile(primary,'{"projects":[');
    await durableWriteJson(backup,{projects:[{id:"project-1",sku:"SKU-恢复"}],jobs:[],operations:[],poseTemplateGroups:[]});
    const valid=(item:unknown):item is {projects:unknown[];jobs:unknown[];operations:unknown[];poseTemplateGroups:unknown[]}=>{const value=item as Record<string,unknown>|null;return Boolean(value&&Array.isArray(value.projects)&&Array.isArray(value.jobs)&&Array.isArray(value.operations)&&Array.isArray(value.poseTemplateGroups))};
    const recovered=await readJsonWithBackups(primary,[backup],valid);
    assert.equal(recovered?.source,backup);assert.equal((recovered?.value.projects[0] as {sku:string}).sku,"SKU-恢复");
  }finally{await fs.rm(root,{recursive:true,force:true})}
});

test("Windows保留设备名不能成为业务文件路径",async()=>{
  const {safeSegment}=await import("../src/lib/ai/validators");
  assert.equal(safeSegment("CON"),"_CON");
  assert.equal(safeSegment("LPT1.jpg"),"_LPT1.jpg");
  assert.equal(safeSegment("中文 文件夹"),"中文-文件夹");
});

test("异常退出后保留项目和成功图片，只把未完成任务标记为中断",async()=>{
  const {interruptJobs,interruptOperations}=await import("../src/lib/recovery");
  const jobs=[{id:"running",phase:"waiting_provider",status:"generating",outputImages:[]},{id:"done",phase:"success",status:"success",outputImages:["/api/files/SKU/pose/done.jpg"]}] as never[];
  const operations=[{id:"op",status:"running",updatedAt:"old"}] as never[];
  assert.equal(interruptJobs(jobs,"2026-09-02T00:00:00.000Z"),1);assert.equal(interruptOperations(operations,"2026-09-02T00:00:00.000Z"),1);
  assert.equal((jobs[0] as {status:string}).status,"interrupted");assert.equal((jobs[1] as {status:string}).status,"success");assert.deepEqual((jobs[1] as {outputImages:string[]}).outputImages,["/api/files/SKU/pose/done.jpg"]);assert.equal((operations[0] as {status:string}).status,"interrupted");
});
