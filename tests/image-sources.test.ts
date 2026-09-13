import test from "node:test";
import assert from "node:assert/strict";
import {assertFormalImageSource,imageSourceVersions,isFormalImageSource} from "../src/lib/image-sources";

test("formal AI sources reject every display derivative",()=>{
  const source="/api/files/SKU/source/master.jpg";
  assert.equal(isFormalImageSource(source),true);
  assert.equal(isFormalImageSource(`${source}?thumbnail=480`),false);
  assert.equal(isFormalImageSource(`${source}?preview=960`),false);
  assert.equal(isFormalImageSource("/api/files/.cache/derivatives/a.jpg"),false);
  assert.throws(()=>assertFormalImageSource(`${source}?thumbnail=480`),/禁止使用缩略图/);
});

test("version set keeps formal bytes separate from display files",()=>{
  const source="/api/files/SKU/pose/master.png",versions=imageSourceVersions(source,source);
  assert.equal(versions.masterSource,source);
  assert.equal(versions.approvedSource,source);
  assert.match(versions.previewSource,/preview=960/);
  assert.match(versions.thumbnailSource,/thumbnail=480/);
});
