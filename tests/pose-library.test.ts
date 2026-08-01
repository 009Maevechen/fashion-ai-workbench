import assert from "node:assert/strict";
import test from "node:test";
import type {PoseTemplateGroup} from "../src/lib/db";
import {assertThreeDistinctPoses,normalizePoseSignature,perceptualHashDistance,poseLibrarySourceAvailability,recommendedPoseGroups} from "../src/lib/pose-library-utils";

const item=(imageHash:string,perceptualHash:string,poseSignature:string)=>({imageHash,perceptualHash,poseSignature});
test("姿势模板组必须正好包含三个姿势",()=>{
  assert.throws(()=>assertThreeDistinctPoses([item("a","0000000000000000","正面"),item("b","ffffffffffffffff","侧面")]),/正好包含3个姿势/);
});
test("相同图片、近似视觉指纹或相同姿势说明不能重复保存",()=>{
  assert.throws(()=>assertThreeDistinctPoses([item("same","0000000000000000","正面"),item("same","ffffffffffffffff","动态"),item("c","5555555555555555","侧面")]),/重复/);
  assert.throws(()=>assertThreeDistinctPoses([item("a","0000000000000000","正面"),item("b","0000000000000001","动态"),item("c","ffffffffffffffff","侧面")]),/重复/);
  assert.throws(()=>assertThreeDistinctPoses([item("a","0000000000000000","正面展示"),item("b","ffffffffffffffff","正面展示"),item("c","5555555555555555","侧面")]),/重复/);
});
test("姿势签名忽略序号、标点和空格",()=>{
  assert.equal(normalizePoseSignature("姿势 01：自然 正面！"),"自然正面");
  assert.equal(perceptualHashDistance("0000000000000000","0000000000000001"),1);
});

test("三张参考图完整时无需等待生成结果审核即可保存姿势库",()=>{
  const available=poseLibrarySourceAvailability(["/a.jpg","/b.jpg","/c.jpg"],["/r1.jpg","/r2.jpg",""],{"1":"approved","2":"approved","3":"pending"});
  assert.equal(available.references,true);
  assert.equal(available.results,false);
});
test("推荐规则优先匹配商品类型并排除归档",()=>{
  const base={description:"",shotType:"full_body",faceMode:"either",styleTags:[],platformTags:[],displayFocus:[],favorite:false,usageCount:0,createdAt:"2026-01-01",updatedAt:"2026-01-01",poses:[]} as unknown as PoseTemplateGroup;
  const groups=[{...base,id:"other",name:"裤装",productTypes:["裤装"],archived:false},{...base,id:"top",name:"上衣",productTypes:["上衣"],archived:false},{...base,id:"archived",name:"归档",productTypes:["上衣"],archived:true}] as PoseTemplateGroup[];
  assert.deepEqual(recommendedPoseGroups(groups,"上衣").map(group=>group.id),["top","other"]);
});
