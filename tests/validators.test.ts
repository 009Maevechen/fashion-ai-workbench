import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {MAX_IMAGE_BYTES,safeSegment,sha,validateOutput,validateUpload} from "../src/lib/ai/validators";
import {POSE_PRESETS} from "../src/lib/ai/pose-presets";

test("路径片段会移除目录穿越字符",()=>{assert.equal(safeSegment("../../SKU 001"),"SKU-001");assert.equal(safeSegment("红色/测试"),"红色-测试")});
test("每种商品类型固定提供三个不同姿势",()=>{for(const [type,presets] of Object.entries(POSE_PRESETS)){assert.equal(presets.length,3,type);assert.equal(new Set(presets).size,3,type)}});
test("合法图片上传可通过解码检查",async()=>{const image=await sharp({create:{width:300,height:400,channels:3,background:"#7845dd"}}).jpeg().toBuffer();const file=new File([new Uint8Array(image)],"valid.jpg",{type:"image/jpeg"});assert.deepEqual(await validateUpload(file),image)});
test("合法PNG上传可通过解码检查",async()=>{const image=await sharp({create:{width:300,height:400,channels:4,background:"#f0f0f0"}}).png().toBuffer();const file=new File([new Uint8Array(image)],"valid.png",{type:"image/png"});assert.deepEqual(await validateUpload(file),image)});
test("伪装图片和超大文件会被拒绝",async()=>{const html=new File([new Uint8Array(600).fill(60)],"fake.jpg",{type:"image/jpeg"});await assert.rejects(validateUpload(html),/无法解码/);const oversized=new File([new Uint8Array(MAX_IMAGE_BYTES+1)],"large.png",{type:"image/png"});await assert.rejects(validateUpload(oversized),/15MB/)});
test("输出与输入相同或候选重复会被拒绝",async()=>{const image=await sharp({create:{width:600,height:800,channels:3,background:"#111111"}}).jpeg().toBuffer(),hash=sha(image);await assert.rejects(validateOutput(image,"image/jpeg",[hash]),/输入图片完全相同/);await assert.rejects(validateOutput(image,"image/jpeg",[],[hash]),/候选结果完全重复/)});
test("偏离3比4的有效图片进入人工审核",async()=>{const image=await sharp({create:{width:900,height:600,channels:3,background:"#eeeeee"}}).jpeg().toBuffer(),result=await validateOutput(image,"image/jpeg");assert.equal(result.needsReview,true);assert.match(result.warnings.join("；"),/比例|横向/)});
test("明显分割线会标记多宫格风险",async()=>{const base=await sharp({create:{width:600,height:800,channels:3,background:"#333333"}}).composite([{input:{create:{width:12,height:800,channels:3,background:"#ffffff"}},left:294,top:0}]).jpeg({quality:95}).toBuffer(),result=await validateOutput(base,"image/jpeg");assert.match(result.warnings.join("；"),/分割线|多宫格/)});
test("复色后边缘颜色变化过大会标记背景审核",async()=>{const before=await sharp({create:{width:600,height:800,channels:3,background:"#111111"}}).jpeg().toBuffer(),after=await sharp({create:{width:600,height:800,channels:3,background:"#eeeeee"}}).jpeg().toBuffer(),result=await validateOutput(after,"image/jpeg",[],[],before);assert.match(result.warnings.join("；"),/背景/)});
