import assert from "node:assert/strict";
import test from "node:test";
import { isValidArrayAssetIndex } from "../src/lib/asset-upload-limits";

test("独立复色允许上传四张图片", () => {
  assert.equal(isValidArrayAssetIndex("standaloneRecolorPoseImages", 3), true);
  assert.equal(isValidArrayAssetIndex("standaloneRecolorPoseImages", 4), false);
});

test("姿势参考图仍限制为三张", () => {
  assert.equal(isValidArrayAssetIndex("poseReferenceImages", 2), true);
  assert.equal(isValidArrayAssetIndex("poseReferenceImages", 3), false);
});

test("数组素材序号必须是非负整数", () => {
  assert.equal(isValidArrayAssetIndex("otherMaterialImages", -1), false);
  assert.equal(isValidArrayAssetIndex("otherMaterialImages", 1.5), false);
});
