import test from "node:test";
import assert from "node:assert/strict";
import {finalPackageIssues,finalPackagePhotoCount} from "../src/lib/final-package";
import type {Project} from "../src/lib/db";

const project:Project={id:"p1",sku:"SKU-1",productName:"测试上衣",productType:"上衣",currentStep:5,status:"等待最终确认",createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z",assets:{},settings:{},dependencyStatus:"current",confirmedTryonImage:"/api/files/SKU-1/tryon/01.jpg",confirmedPoseImages:["/api/files/SKU-1/pose/01.jpg","/api/files/SKU-1/pose/02.jpg"],targetColors:[{id:"black",name:"黑色",hex:"#111111",sourceCount:2,status:"confirmed",poseResults:["/api/files/SKU-1/recolor/black/01.jpg","/api/files/SKU-1/recolor/black/02.jpg"]}]};

test("两张已确认姿势及对应复色套图可以按货号整组确认",()=>{
  assert.deepEqual(finalPackageIssues(project),[]);
});

test("上游过期会明确提示，部分复色图可以直接收集",()=>{
  assert.ok(finalPackageIssues({...project,dependencyStatus:"needs_review"}).length>0);
  assert.deepEqual(finalPackageIssues({...project,targetColors:[{...project.targetColors![0],status:"success",poseResults:["/one.jpg"]}]}),[]);
});

test("错误和未完成项只作提示，只要有照片就可组成导出包",()=>{
  const partial={...project,dependencyStatus:"needs_review" as const,targetColors:[{...project.targetColors![0],status:"failed" as const,poseResults:["/one.jpg"]}]};
  assert.ok(finalPackageIssues(partial).length>0);
  assert.equal(finalPackagePhotoCount(partial),4);
  assert.equal(finalPackagePhotoCount({...project,confirmedTryonImage:undefined,confirmedPoseImages:[],targetColors:[],confirmedRecolorImages:[]}),0);
});
