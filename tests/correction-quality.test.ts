import test from "node:test";
import assert from "node:assert/strict";
import { resolveCorrectionQualityCheck } from "../src/lib/correction-quality";
import type { ImageQualityAssessment } from "../src/lib/image-quality-check";

function quality(
  width: number,
  height: number,
  sharpnessScore: number,
): ImageQualityAssessment {
  return {
    width,
    height,
    sharpnessScore,
    blurry: sharpnessScore < 180,
    lowResolution: width < 1024 || height < 1365,
    issues: [],
  };
}

test("咒语修改保持分辨率和锐度时通过", () => {
  const result = resolveCorrectionQualityCheck(
    quality(1536, 2048, 420),
    quality(1536, 2048, 390),
  );
  assert.equal(result.passed, true);
  assert.deepEqual(result.issues, []);
});

test("咒语修改后明显降分辨率或变糊时必须标记重做", () => {
  const result = resolveCorrectionQualityCheck(
    quality(1536, 2048, 420),
    quality(768, 1024, 150),
  );
  assert.equal(result.passed, false);
  assert.match(result.issues.join("；"), /分辨率下降/);
  assert.match(result.issues.join("；"), /清晰度明显下降/);
  assert.match(result.issues.join("；"), /模糊或涂抹感/);
});

test("分辨率轻微下降也不能静默通过",()=>{
  assert.equal(resolveCorrectionQualityCheck(quality(1536,2048,420),quality(1535,2048,420)).passed,false);
});

test("生成母图按原始字节持久化，连续编辑不引入本地压缩",async()=>{
  const sharp=(await import("sharp")).default;
  const {optimizeFinalImage}=await import("../src/lib/image-optimize");
  const input=await sharp({create:{width:1600,height:2200,channels:3,background:"#c7a997"}}).png().toBuffer();
  const first=await optimizeFinalImage(input,{preserveQuality:true});
  const second=await optimizeFinalImage(first.buffer,{preserveQuality:true});
  assert.equal(first.mime,"image/png");
  assert.equal(second.width,1600);
  assert.equal(second.height,2200);
  assert.deepEqual(second.buffer,input);
  assert.equal(second.optimized,false);
});
