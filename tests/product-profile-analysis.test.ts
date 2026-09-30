import assert from "node:assert/strict";
import test from "node:test";
import { mergeProductProfileAnalysis } from "../src/lib/product-profile-analysis";

test("自动识别回填详细商品资料", () => {
  const result = mergeProductProfileAnalysis(undefined, {
    attributes: { fit: "修身", garmentLength: "长款", pocketDetails: "无口袋", fabric: "针织" },
    detailDescription: "圆领无袖长款针织连衣裙，侧腰有抽褶装饰。",
    protectionItems: ["保持圆领", "保持侧腰抽褶"],
  });
  assert.equal(result.attributes?.fit, "修身");
  assert.equal(result.attributes?.garmentLength, "长款");
  assert.equal(result.detailDescription, "圆领无袖长款针织连衣裙，侧腰有抽褶装饰。");
  assert.equal(result.reviewStatus, "awaiting_review");
});

test("自动识别不覆盖人工字段和已确认资料", () => {
  const manual = mergeProductProfileAnalysis({
    reviewStatus: "awaiting_review",
    attributes: { fit: "人工确认版型", fabric: "旧面料" },
    manualAttributeKeys: ["fit"],
    protectionItems: ["人工保护项"],
    manualProtectionEdited: true,
  }, {
    attributes: { fit: "宽松", fabric: "针织" },
    protectionItems: ["AI保护项"],
  });
  assert.equal(manual.attributes?.fit, "人工确认版型");
  assert.equal(manual.attributes?.fabric, "针织");
  assert.deepEqual(manual.protectionItems, ["人工保护项"]);

  const confirmed = { reviewStatus: "confirmed" as const, attributes: { fit: "已确认" } };
  assert.equal(mergeProductProfileAnalysis(confirmed, { attributes: { fit: "宽松" } }), confirmed);
});
