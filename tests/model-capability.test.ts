import test from "node:test";
import assert from "node:assert/strict";
import { inferCapabilities, capabilitiesMatch, missingCapabilities } from "../src/lib/model-capability-utils";

test("mix-gpt-5.4 应识别为具有视觉理解能力", () => {
  const caps = inferCapabilities("openai-compatible", "mix-gpt-5.4");
  assert.ok(caps.includes("vision"), "mix-gpt-5.4 应包含 vision 能力");
});

test("新版 GPT 系列模型应识别视觉能力", () => {
  for (const model of ["gpt-5", "gpt-5.4", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"]) {
    const caps = inferCapabilities("openai-compatible", model);
    assert.ok(caps.includes("vision"), `${model} 应包含 vision 能力`);
  }
});

test("纯文本模型不应识别视觉能力", () => {
  const caps = inferCapabilities("openai-compatible", "deepseek-chat");
  assert.ok(!caps.includes("vision"), "deepseek-chat 不应有 vision");
  assert.ok(caps.includes("text"), "deepseek-chat 应有 text");
});

test("图片生成模型不应误配到需要视觉理解的工作流", () => {
  const caps = inferCapabilities("openai-compatible", "gpt-image-2");
  assert.ok(caps.includes("image-generation"));
  assert.ok(caps.includes("image-editing"));
  assert.ok(caps.includes("multi-image"));
  assert.ok(!caps.includes("vision"), "纯生图模型不应有 vision");
  assert.ok(!capabilitiesMatch(caps, ["vision"]));
  const missing = missingCapabilities(caps, ["vision"]);
  assert.deepEqual(missing, ["vision"]);
});

test("gpt-image-2 可以保存到需要多图编辑的换装和姿势工作流",()=>{
  const caps=inferCapabilities("syc-openai-compatible","gpt-image-2");
  assert.equal(capabilitiesMatch(caps,["image-editing","multi-image"]),true);
  assert.deepEqual(missingCapabilities(caps,["image-editing","multi-image"]),[]);
});

test("gpt-image 系列不应被当作视觉模型用于商品识别", () => {
  const caps = inferCapabilities("openai-compatible", "gpt-image-2");
  assert.ok(!caps.includes("vision"));
});

test("deepseek-r1 有 reasoning 能力", () => {
  const caps = inferCapabilities("openai-compatible", "deepseek-r1");
  assert.ok(caps.includes("reasoning"));
});
