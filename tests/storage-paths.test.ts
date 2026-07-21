import test from "node:test";
import assert from "node:assert/strict";
import {isSafeStoredPath,outputSegments} from "../src/lib/ai/storage-paths";

test("复色结果使用recolor和独立颜色子目录",()=>{assert.deepEqual(outputSegments("FF/12502","recolor/卡其色","FF12502_卡其色_pose01.jpg"),["FF-12502","recolor","卡其色","FF12502_卡其色_pose01.jpg"])});
test("图片访问路径拒绝目录穿越",()=>{assert.equal(isSafeStoredPath(["FF12502","pose","..","secret.jpg"]),false);assert.equal(isSafeStoredPath(["FF12502","pose","FF12502_pose01.jpg"]),true)});
test("颜色名称中的斜杠不会创建额外目录",()=>{assert.deepEqual(outputSegments("SKU","recolor/黑色/../白色","result.jpg"),["SKU","recolor","黑色","untitled","白色","result.jpg"])});
