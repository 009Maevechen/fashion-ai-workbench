import test from "node:test";
import assert from "node:assert/strict";
import {buildBflRequest,buildFashnRequest,buildOpenAiCompatibleRequest,parseOpenAiCompatibleImage,providerInputImageFilename} from "../src/lib/ai/provider-contracts";
import type {GenerateInput} from "../src/lib/ai/types";

const input:GenerateInput={workflow:"tryon",images:["data:model","data:garment"],prompt:"keep details",options:{mode:"standard",sku:"SKU-1",seed:123}};

test("BFL VTO使用person和garment字段",()=>{
  assert.deepEqual(buildBflRequest(input),{person:"data:model",garment:"data:garment",prompt:"keep details",output_format:"jpeg"});
});

test("FASHN Try-On Max使用当前官方请求结构",()=>{
  assert.deepEqual(buildFashnRequest(input,"tryon-max"),{
    model_name:"tryon-max",
    inputs:{model_image:"data:model",product_image:"data:garment",prompt:"keep details",generation_mode:"balanced",resolution:"2k",num_images:1,output_format:"jpeg",return_base64:false,seed:123},
  });
});

test("FASHN 精细模式使用quality与2K且每次只生成一张",()=>{
  const quality={...input,options:{...input.options,mode:"quality" as const}};
  assert.deepEqual(buildFashnRequest(quality,"tryon-max").inputs,{model_image:"data:model",product_image:"data:garment",prompt:"keep details",generation_mode:"quality",resolution:"2k",num_images:1,output_format:"jpeg",return_base64:false,seed:123});
});

test("OpenAI兼容中转站请求保留模型、输入图和随机种子",()=>{assert.deepEqual(buildOpenAiCompatibleRequest(input,"relay-image-model"),{model:"relay-image-model",prompt:"keep details",image:["data:model","data:garment"],images:["data:model","data:garment"],n:1,response_format:"b64_json",size:"1024x1536",seed:123})});
test("OpenAI兼容响应支持临时URL和Base64，并拒绝空结果",()=>{assert.equal(parseOpenAiCompatibleImage({data:[{url:"https://cdn.example.com/output.png"}]}).temporaryImageUrl,"https://cdn.example.com/output.png");assert.equal(parseOpenAiCompatibleImage({data:[{b64_json:"YWJj"}]}).imageBase64,"YWJj");assert.throws(()=>parseOpenAiCompatibleImage({data:[]}),/没有可读取的图片/)});
test("通用多图接口通过文件名严格标记换装双图职责",()=>{
  assert.equal(providerInputImageFilename("tryon",0,"jpg"),"01-model-reference-keep-person-pose-scene.jpg");
  assert.equal(providerInputImageFilename("tryon",1,"png"),"02-garment-product-use-clothing-only.png");
});
