import test from "node:test";
import assert from "node:assert/strict";
import {uniqueArchivePath} from "../src/lib/archive-paths";

test("ZIP路径首次使用时保持标准文件名",()=>{
  const used=new Set<string>();
  assert.equal(uniqueArchivePath("recolor/黑色/SKU_黑色_pose01.jpg",used),"recolor/黑色/SKU_黑色_pose01.jpg");
});

test("ZIP同名文件按_v2和_v3追加版本",()=>{
  const used=new Set<string>();
  assert.equal(uniqueArchivePath("pose/SKU_original_pose01.jpg",used),"pose/SKU_original_pose01.jpg");
  assert.equal(uniqueArchivePath("pose/SKU_original_pose01.jpg",used),"pose/SKU_original_pose01_v2.jpg");
  assert.equal(uniqueArchivePath("pose/SKU_original_pose01.jpg",used),"pose/SKU_original_pose01_v3.jpg");
});
