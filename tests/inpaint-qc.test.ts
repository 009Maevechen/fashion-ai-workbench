import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {checkInpaintProtectedRegion} from "../src/lib/inpaint-qc";

async function solid(rgb:{r:number;g:number;b:number}){return sharp({create:{width:300,height:400,channels:3,background:rgb}}).png().toBuffer()}
async function mask(){return sharp({create:{width:300,height:400,channels:4,background:{r:255,g:255,b:255,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:80,channels:4,background:{r:255,g:255,b:255,alpha:1}}}).png().toBuffer(),left:110,top:160}]).png().toBuffer()}

test("inpaint QC passes when protected pixels remain unchanged",async()=>{
  const source=await solid({r:180,g:170,b:160});
  assert.equal((await checkInpaintProtectedRegion(source,source,await mask())).passed,true);
});

test("inpaint QC returns failure when mask outside is redrawn",async()=>{
  const result=await checkInpaintProtectedRegion(await solid({r:180,g:170,b:160}),await solid({r:90,g:90,b:90}),await mask());
  assert.equal(result.passed,false);
  assert.match(result.issues.join("；"),/Mask外区域/);
});
