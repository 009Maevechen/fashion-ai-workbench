import test from "node:test";
import assert from "node:assert/strict";
import {serializeSycRequest} from "../src/lib/ai/providers/syc/request-queue";

test("SYC 大图请求严格串行，避免批量并发压垮中转站",async()=>{
  const events:string[]=[];
  let releaseFirst!:()=>void;
  const first=serializeSycRequest(async()=>{events.push("first:start");await new Promise<void>(resolve=>{releaseFirst=resolve});events.push("first:end")});
  const second=serializeSycRequest(async()=>{events.push("second:start");events.push("second:end")});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(events,["first:start"]);
  releaseFirst();
  await Promise.all([first,second]);
  assert.deepEqual(events,["first:start","first:end","second:start","second:end"]);
});

test("前一个SYC请求失败后不会堵塞后续任务",async()=>{
  await assert.rejects(()=>serializeSycRequest(async()=>{throw new Error("network")}));
  assert.equal(await serializeSycRequest(async()=>"ok"),"ok");
});
