import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {runtimeDataDir,runtimeOutputsDir,runtimeProjectProcessDir,runtimeProjectProcessSearchDirs} from "../src/lib/runtime-paths";

test("桌面版可以把数据和图片切换到Windows用户可写目录",()=>{
  const oldData=process.env.AI_STUDIO_DATA_DIR,oldOutputs=process.env.AI_STUDIO_OUTPUTS_DIR;
  process.env.AI_STUDIO_DATA_DIR=path.join(process.cwd(),"tmp-desktop-data");
  process.env.AI_STUDIO_OUTPUTS_DIR=path.join(process.cwd(),"tmp-desktop-outputs");
  assert.equal(runtimeDataDir(),path.resolve("tmp-desktop-data"));
  assert.equal(runtimeOutputsDir(),path.resolve("tmp-desktop-outputs"));
  assert.equal(runtimeProjectProcessDir(),path.resolve("tmp-desktop-outputs"));
  assert.equal(runtimeProjectProcessSearchDirs().includes(path.resolve("tmp-desktop-outputs")),true);
  if(oldData===undefined)delete process.env.AI_STUDIO_DATA_DIR;else process.env.AI_STUDIO_DATA_DIR=oldData;
  if(oldOutputs===undefined)delete process.env.AI_STUDIO_OUTPUTS_DIR;else process.env.AI_STUDIO_OUTPUTS_DIR=oldOutputs;
});
