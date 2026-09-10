import test from "node:test";
import assert from "node:assert/strict";
import {recolorColorsWithSavedJobs,removeRecolorCollectionImage} from "../src/lib/recolor-collection";
import type {Job,Project} from "../src/lib/db";

const project:Project={id:"p",sku:"SKU",productName:"上衣",productType:"上衣",currentStep:5,status:"等待最终确认",createdAt:"2026-01-01",updatedAt:"2026-01-01",assets:{},settings:{},targetColors:[{id:"black",name:"黑色",hex:"#000000",status:"success",poseResults:["/api/files/SKU/recolor/black/01.jpg","/api/files/SKU/recolor/black/02.jpg"]}]};

test("复色集合可以只删除用户选中的单张图片",()=>{
  const patch=removeRecolorCollectionImage(project,"black","/api/files/SKU/recolor/black/01.jpg");
  assert.deepEqual(patch.targetColors[0].poseResults,["/api/files/SKU/recolor/black/02.jpg"]);
  assert.equal(patch.targetColors[0].status,"success");
  assert.equal(patch.stepStatuses["4"],"completed");
});

test("不允许通过集合删除接口删除其他图片",()=>{
  assert.throws(()=>removeRecolorCollectionImage(project,"black","/api/files/other.jpg"),/不属于/);
});

test("无需确认颜色，成功任务会自动进入对应最终结果集合",()=>{
  const pending:Project={...project,targetColors:[{id:"white",name:"冷白色",hex:"#FCFCFD",status:"ready",sourceCount:2}]};
  const base={projectId:"p",sku:"SKU",workflow:"recolor",provider:"test",model:"image",mode:"standard",inputImages:[],promptVersion:"v1",startedAt:"2026-01-01",outputImages:[],status:"success"} satisfies Omit<Job,"id"|"slot"|"targetColorId"|"colorName">;
  const jobs:Job[]=[
    {...base,id:"one",slot:1,targetColorId:"white",colorName:"冷白色",outputImages:["/api/files/SKU/recolor/冷白色/01.jpg"]},
    {...base,id:"two",slot:2,targetColorId:"white",colorName:"冷白色",outputImages:["/api/files/SKU/recolor/冷白色/02.jpg"]},
  ];
  const [white]=recolorColorsWithSavedJobs(pending,jobs);
  assert.deepEqual(white.poseResults,jobs.map(job=>job.outputImages[0]));
  assert.equal(white.status,"success");
});

test("复色 AI 质检失败仍进入人工结果集合，过期结果不替换当前结果",()=>{
  const base={id:"qc",projectId:"p",sku:"SKU",workflow:"recolor",provider:"test",model:"image",mode:"standard",inputImages:[],promptVersion:"v1",startedAt:"2026-01-01",outputImages:["/api/files/review.png"],status:"needs_redo",slot:1,targetColorId:"black"} satisfies Job;
  const stale:Job={...base,id:"stale",startedAt:"2026-01-02",dependencyStatus:"stale",outputImages:["/api/files/stale.png"]};
  assert.equal(recolorColorsWithSavedJobs(project,[base,stale])[0].poseResults?.[0],"/api/files/review.png");
});
