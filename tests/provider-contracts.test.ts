import test from "node:test";
import assert from "node:assert/strict";
import {buildBflRequest,buildFashnRequest,buildOpenAiCompatibleRequest,buildVolcengineRequest,parseOpenAiCompatibleImage,parseVolcengineImage,providerInputImageFilename,volcengineImagesEndpoint} from "../src/lib/ai/provider-contracts";
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
test("火山方舟文生图请求不发送空image字段",()=>{
  const textInput:GenerateInput={...input,images:[]};
  assert.deepEqual(buildVolcengineRequest(textInput,"doubao-seedream-5-0-pro-260628"),{
    model:"doubao-seedream-5-0-pro-260628",prompt:"keep details",sequential_image_generation:"disabled",stream:false,response_format:"url",size:"2K",watermark:true,seed:123,
  });
});
test("火山方舟多图编辑保留全部参考图",()=>{
  assert.deepEqual(buildVolcengineRequest(input,"seedream-model").image,["data:model","data:garment"]);
});
test("火山方舟端点兼容API根地址和完整生成端点",()=>{
  assert.equal(volcengineImagesEndpoint("https://ark.cn-beijing.volces.com/api/v3"),"https://ark.cn-beijing.volces.com/api/v3/images/generations");
  assert.equal(volcengineImagesEndpoint("https://ark.cn-beijing.volces.com/api/v3/images/generations/"),"https://ark.cn-beijing.volces.com/api/v3/images/generations");
});
test("火山方舟响应支持URL、Base64 Data URL，并拒绝空结果",()=>{
  assert.equal(parseVolcengineImage({data:[{url:"https://cdn.example.com/seedream.png"}]}).temporaryImageUrl,"https://cdn.example.com/seedream.png");
  assert.deepEqual(parseVolcengineImage({data:[{b64_json:"data:image/png;base64,YWJj"}]}),{temporaryImageUrl:undefined,imageBase64:"YWJj",mimeType:"image/png"});
  assert.throws(()=>parseVolcengineImage({data:[]}),/没有可读取的图片/);
});
test("通用多图接口通过文件名严格标记换装双图职责",()=>{
  assert.equal(providerInputImageFilename("tryon",0,"jpg"),"01-model-reference-keep-person-pose-scene.jpg");
  assert.equal(providerInputImageFilename("tryon",1,"png"),"02-garment-product-use-clothing-only.png");
});
test("三姿势三图输入文件名固定人物底图、服装与姿势职责",()=>{
  assert.equal(providerInputImageFilename("pose",0,"jpg",3),"01-source-model-keep-exact-person-and-scene.jpg");
  assert.equal(providerInputImageFilename("pose",1,"png",3),"02-garment-product-use-clothing-only.png");
  assert.equal(providerInputImageFilename("pose",2,"jpg",3),"03-pose-reference-use-pose-only-discard-person.jpg");
});
test("三姿势双图输入仍把第二张严格标记为仅姿势参考",()=>{
  assert.equal(providerInputImageFilename("pose",0,"jpg",2),"01-source-model-keep-exact-person-and-scene.jpg");
  assert.equal(providerInputImageFilename("pose",1,"jpg",2),"02-pose-reference-use-pose-only-discard-person.jpg");
});
