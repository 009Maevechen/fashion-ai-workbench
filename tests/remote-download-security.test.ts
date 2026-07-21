import test from "node:test";
import assert from "node:assert/strict";
import {validateRemoteImageUrl} from "../src/lib/ai/remote-url";

test("生成图下载只接受公共HTTPS地址",()=>{
  assert.equal(validateRemoteImageUrl("https://delivery.example.com/image.jpg").hostname,"delivery.example.com");
  assert.throws(()=>validateRemoteImageUrl("http://example.com/image.jpg"),/HTTPS/);
  assert.throws(()=>validateRemoteImageUrl("https://127.0.0.1/image.jpg"),/本机或内网/);
  assert.throws(()=>validateRemoteImageUrl("https://192.168.1.2/image.jpg"),/本机或内网/);
  assert.throws(()=>validateRemoteImageUrl("https://[::1]/image.jpg"),/本机或内网/);
  assert.throws(()=>validateRemoteImageUrl("https://user:secret@example.com/image.jpg"),/登录信息/);
});
