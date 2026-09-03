import test from "node:test";
import assert from "node:assert/strict";
import {originalImageUrl,thumbnailUrl} from "../src/lib/image-url";

test("复制缩略图时会读取原始照片而不是压缩版本",()=>{
  const original="/api/files/SKU/recolor/photo.jpg?token=local";
  assert.equal(originalImageUrl(thumbnailUrl(original,480)),original);
});

test("外部图片和临时上传图片保持可复制地址",()=>{
  assert.equal(originalImageUrl("https://example.com/photo.jpg?thumbnail=320&token=abc"),"https://example.com/photo.jpg?token=abc");
  assert.equal(originalImageUrl("blob:http://127.0.0.1/local-image"),"blob:http://127.0.0.1/local-image");
});
