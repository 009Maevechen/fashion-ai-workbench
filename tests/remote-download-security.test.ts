import test from "node:test";
import assert from "node:assert/strict";
import {isProxySyntheticAddress,validateRemoteImageUrl} from "../src/lib/ai/remote-url";

test("生成图下载只接受公共HTTPS地址",()=>{
  assert.equal(validateRemoteImageUrl("https://delivery.example.com/image.jpg").hostname,"delivery.example.com");
  assert.throws(()=>validateRemoteImageUrl("http://example.com/image.jpg"),/HTTPS/);
  assert.throws(()=>validateRemoteImageUrl("https://127.0.0.1/image.jpg"),/本机或内网/);
  assert.throws(()=>validateRemoteImageUrl("https://192.168.1.2/image.jpg"),/本机或内网/);
  assert.throws(()=>validateRemoteImageUrl("https://[::1]/image.jpg"),/本机或内网/);
  assert.throws(()=>validateRemoteImageUrl("https://user:secret@example.com/image.jpg"),/登录信息/);
  assert.throws(()=>validateRemoteImageUrl("https://198.18.1.2/image.jpg"),/本机或内网/);
});

test("识别本机代理的公共域名 Fake-IP",()=>{
  assert.equal(isProxySyntheticAddress("198.18.1.2"),true);
  assert.equal(isProxySyntheticAddress("198.19.255.254"),true);
  assert.equal(isProxySyntheticAddress("198.20.0.1"),false);
  assert.equal(isProxySyntheticAddress("192.168.1.2"),false);
});
