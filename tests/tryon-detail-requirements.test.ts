import test from "node:test";
import assert from "node:assert/strict";
import {composeTryonDetailRequirements,normalizeTryonDetailRequirements} from "../src/lib/tryon-detail-requirements";

test("换装细节会去除重复累积的商品结构段落",()=>{
  const structure="商品结构：保持领口和袖口。",manual="禁止改变服装类别。";
  assert.equal(composeTryonDetailRequirements(structure,manual,`${structure}\n${manual}`),`${structure}\n${manual}`);
});

test("超长换装细节会在完整语句边界安全收敛",()=>{
  const value=Array.from({length:1000},(_,index)=>`要求${index}：保持商品细节。`).join("\n");
  const normalized=normalizeTryonDetailRequirements(value,6000);
  assert.ok(normalized.length<=6000);
  assert.match(normalized,/。$/);
});
