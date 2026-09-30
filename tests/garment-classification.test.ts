import assert from "node:assert/strict";
import test from "node:test";
import { GARMENT_TAXONOMY, categoryFromVisualLabels, legacyProductType, mergeGarmentClassification, productionGarmentProfileText, validateGarmentClassification, type GarmentClassification } from "../src/lib/garment-classification";
import { normalizeSkuRow } from "../src/lib/sku-production";

const detected: GarmentClassification = {
  category: "上衣", subcategory: "毛衣", garmentType: "宽松针织短款毛衣",
  style: "休闲", fit: "宽松", length: "短款", silhouette: "直筒",
  material: "针织", season: "无法从图片确认", gender: "无法从图片确认",
  displayFocus: "领口和袖口罗纹", confidence: 0.91, needsReview: false, issues: [],
};

test("三级分类库覆盖全部指定大类和典型二级类目", () => {
  assert.deepEqual(Object.keys(GARMENT_TAXONOMY), ["上衣", "裤子", "裙子", "连衣裙", "外套", "套装", "运动服", "内搭", "泳装", "礼服", "配饰"]);
  assert.ok(GARMENT_TAXONOMY.上衣.includes("毛衣"));
  assert.ok(GARMENT_TAXONOMY.裤子.includes("牛仔裤"));
  assert.ok(GARMENT_TAXONOMY.连衣裙.includes("针织裙"));
  assert.equal(legacyProductType("裙子", "A字裙"), "半身裙");
  assert.equal(legacyProductType("连衣裙", "针织裙"), "连衣裙");
});

test("视觉分类规范化并进入下游保护规则文本", () => {
  const profile = mergeGarmentClassification(undefined, validateGarmentClassification(detected), "/product.jpg");
  assert.equal(profile.category, "上衣");
  assert.equal(profile.subcategory, "毛衣");
  assert.equal(profile.garmentType, "宽松针织短款毛衣");
  assert.match(productionGarmentProfileText(profile), /宽松针织短款毛衣/);
  assert.doesNotMatch(productionGarmentProfileText(profile), /无法从图片确认/);
});

test("人工确认与人工修改字段不会被下一次AI识别覆盖", () => {
  const original = mergeGarmentClassification(undefined, detected, "/a.jpg");
  const manuallyEdited = { ...original, material: "羊毛混纺", manualFields: ["material" as const] };
  const next = mergeGarmentClassification(manuallyEdited, { ...detected, material: "棉", fit: "修身" }, "/b.jpg");
  assert.equal(next.material, "羊毛混纺");
  assert.equal(next.fit, "修身");
  const confirmed = mergeGarmentClassification({ ...next, classificationConfirmed: true }, { ...detected, category: "外套", subcategory: "夹克" }, "/c.jpg");
  assert.equal(confirmed.primaryCategory, "上衣");
  assert.equal(confirmed.sourceImage, "/c.jpg");
  assert.ok(confirmed.riskWarnings.some((warning) => warning.includes("产品图已更换")));
});

test("表格标题不再冒充产品图视觉分类", () => {
  const row = normalizeSkuRow({ SKU: "A001", 商品名称: "高腰阔腿牛仔裤", 产品图: "/tmp/a.jpg" }, 2);
  assert.equal(row.garmentProfile.primaryCategory, "");
  assert.equal(row.garmentProfile.confidence, 0);
  assert.ok(row.issues.some((issue) => issue.includes("禁止按标题猜测")));
});

test("表格空类目可由产品图识别填入，非空人工类目保持不变", () => {
  const empty = normalizeSkuRow({ SKU: "A002", 商品名称: "保暖毛衣", 产品图: "/tmp/a.jpg" }, 2).garmentProfile;
  const recognized = mergeGarmentClassification(empty, detected, "/tmp/a.jpg");
  assert.equal(recognized.primaryCategory, "上衣");
  assert.equal(recognized.secondaryCategory, "毛衣");
  const manual = normalizeSkuRow({ SKU: "A003", 分类: "外套", 商品名称: "保暖毛衣", 产品图: "/tmp/a.jpg" }, 2).garmentProfile;
  const preserved = mergeGarmentClassification(manual, detected, "/tmp/a.jpg");
  assert.equal(preserved.primaryCategory, "外套");
});

test("旧版产品图细节识别只接受可验证的可见类别，不猜上衣", () => {
  assert.equal(categoryFromVisualLabels("裤装", "牛仔裤"), "裤子");
  assert.equal(categoryFromVisualLabels("", "羽绒服"), "外套");
  assert.equal(categoryFromVisualLabels("无法从图片确认", "打底衫"), "");
  assert.equal(categoryFromVisualLabels("无法从图片确认", "无法从图片确认"), "");
});

test("二级类目不匹配及低置信度进入人工复核", () => {
  const result = validateGarmentClassification({ ...detected, subcategory: "西装外套", confidence: 0.4 });
  assert.equal(result.needsReview, true);
  assert.ok(result.issues.some((issue) => issue.includes("子类不在")));
  assert.ok(result.issues.some((issue) => issue.includes("置信度")));
});
