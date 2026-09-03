import test from "node:test";
import assert from "node:assert/strict";
import {migrateSycBaseUrl,normalizeSycBaseUrl,SYC_DEFAULT_BASE_URL,sycEndpoint} from "../src/lib/ai/providers/syc/config";
import {parseSycImageResponse,parseSycModels} from "../src/lib/ai/providers/syc/response-parser";
import {normalizeSycImageUrl} from "../src/lib/ai/providers/syc/image-url";

test("SYC URL保留用户填写的协议和路径",()=>{
  assert.equal(SYC_DEFAULT_BASE_URL,"https://ai.sycagent.top/v1");
  assert.equal(migrateSycBaseUrl("https://sycagent.top/v1/"),"https://ai.sycagent.top/v1");
  assert.equal(normalizeSycBaseUrl("https://sycagent.top"),"https://sycagent.top");
  assert.equal(normalizeSycBaseUrl("https://sycagent.top/v1/"),"https://ai.sycagent.top/v1");
  assert.equal(normalizeSycBaseUrl("http://127.0.0.1:8080/custom"),"http://127.0.0.1:8080/custom");
  assert.equal(normalizeSycBaseUrl("  https://sycagent.top/api  "),"https://sycagent.top/api");
  assert.throws(()=>normalizeSycBaseUrl("ftp://sycagent.top"),/HTTP 或 HTTPS/);
  assert.throws(()=>normalizeSycBaseUrl("https://user:pass@sycagent.top/v1"),/账号或密码/);
  assert.equal(sycEndpoint(SYC_DEFAULT_BASE_URL,"models"),"https://ai.sycagent.top/v1/models");
});

test("SYC模型列表只接受真实data列表",()=>{
  assert.deepEqual(parseSycModels({data:[{id:"gpt-image-2"},{id:"mix-gpt-5.4"}]}),["gpt-image-2","mix-gpt-5.4"]);
  assert.throws(()=>parseSycModels({models:[]}),/data 数组/);
});

test("SYC图片解析兼容Base64、URL与Responses嵌套结构",()=>{
  const png=Buffer.alloc(120,1).toString("base64");
  assert.equal(parseSycImageResponse({data:[{b64_json:png}]}).imageBase64,png);
  assert.equal(parseSycImageResponse({data:[{url:"https://cdn.example.com/a.png"}]}).temporaryImageUrl,"https://cdn.example.com/a.png");
  assert.equal(parseSycImageResponse({output:[{content:[{image_url:"https://cdn.example.com/b.png"}]}]}).temporaryImageUrl,"https://cdn.example.com/b.png");
  assert.throws(()=>parseSycImageResponse({data:[]}),/没有可读取/);
});

test("SYC 内网临时图片地址改用已配置的公共域名下载",()=>{
  assert.equal(normalizeSycImageUrl("http://127.0.0.1:3000/v1/files/result.png","https://ai.sycagent.top/v1"),"https://ai.sycagent.top/v1/files/result.png");
  assert.equal(normalizeSycImageUrl("http://localhost:3000/files/result.png?token=temporary","https://ai.sycagent.top/v1"),"https://ai.sycagent.top/files/result.png?token=temporary");
  assert.equal(normalizeSycImageUrl("https://cdn.example.com/result.png","https://ai.sycagent.top/v1"),"https://cdn.example.com/result.png");
});
