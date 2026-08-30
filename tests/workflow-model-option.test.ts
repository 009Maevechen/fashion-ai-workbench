import test from "node:test";
import assert from "node:assert/strict";
import {modelForWorkflow} from "../src/lib/workflow-model-option";
import type {ApiProviderPublic} from "../src/lib/ai/provider-settings-types";

const provider={defaultModel:"gpt-image-2",chatModel:"mix-gpt-5.6-terra",visionModel:"mix-gpt-5.5"} as ApiProviderPublic;

test("咒语矫正必须选择对话模型而不是图片模型",()=>{
  assert.equal(modelForWorkflow(provider,"correction"),"mix-gpt-5.6-terra");
  assert.equal(modelForWorkflow(provider,"prompt-optimize"),"mix-gpt-5.6-terra");
});

test("图片工作流继续选择图片模型",()=>{
  assert.equal(modelForWorkflow(provider,"tryon"),"gpt-image-2");
  assert.equal(modelForWorkflow(provider,"recolor"),"gpt-image-2");
});

test("没有对话模型时不得用图片模型冒充咒语模型",()=>{
  const imageOnly={...provider,chatModel:undefined} as ApiProviderPublic;
  assert.equal(modelForWorkflow(imageOnly,"correction"),undefined);
});
