import test from "node:test";
import assert from "node:assert/strict";
import {isJobRunning,isWorkflowGenerating,markGenerationCancelled,isGenerationCancelled,clearGenerationCancellation} from "../src/lib/generation-cancel";
import type {Job} from "../src/lib/db";

function job(partial:Partial<Job>):Job{
  return {id:"j",projectId:"p",sku:"s",workflow:"tryon",provider:"",model:"",mode:"standard",inputImages:[],outputImages:[],promptVersion:"",status:"queued",startedAt:new Date().toISOString(),...partial};
}

test("识别运行中的生成任务",()=>{
  assert.equal(isJobRunning(job({phase:"waiting_provider"})),true);
  assert.equal(isJobRunning(job({status:"generating"})),true);
  assert.equal(isJobRunning(job({phase:"success",status:"success"})),false);
  assert.equal(isJobRunning(job({phase:"failed",status:"failed"})),false);
  assert.equal(isJobRunning(job({phase:"interrupted",status:"interrupted"})),false);
});

test("判断某个工作流是否正在生成",()=>{
  const jobs=[job({workflow:"tryon",phase:"downloading"}),job({workflow:"pose",phase:"success",status:"success"})];
  assert.equal(isWorkflowGenerating(jobs,"tryon"),true);
  assert.equal(isWorkflowGenerating(jobs,"pose"),false);
  assert.equal(isWorkflowGenerating(jobs,"recolor"),false);
});

test("取消标记可设置、判断并清除",()=>{
  const projectId="project-1";
  assert.equal(isGenerationCancelled(projectId,"pose"),false);
  markGenerationCancelled(projectId,"pose");
  assert.equal(isGenerationCancelled(projectId,"pose"),true);
  assert.equal(isGenerationCancelled(projectId,"tryon"),false);
  clearGenerationCancellation(projectId,"pose");
  assert.equal(isGenerationCancelled(projectId,"pose"),false);
});
