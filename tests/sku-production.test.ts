import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGarment,
  inferDesignLevel,
  inferTaskTypes,
  normalizeSkuRow,
  operationalProductType,
  parseColorNames,
} from "../src/lib/sku-production";

test("WPS 商品行兼容中英文表头并保持 SKU 为文本", () => {
  const row = normalizeSkuRow({
    "货号": "JR00507",
    "商品名称": "撞色针织衫",
    "商品图片路径": "D:\\商品\\JR00507-main.jpg",
    "模特参考图": "D:\\商品\\model.jpg",
    "姿势参考图": "p1.jpg;p2.jpg;p3.jpg",
    "制作要求": "先换装，再生成三姿势和黑白两款复色",
    "颜色信息": "白色、黑色",
    "备注信息": "条纹与包边保持不变",
  }, 2);
  assert.equal(row.sku, "JR00507");
  assert.deepEqual(row.taskTypes, ["换装", "复色", "三姿势"]);
  assert.deepEqual(row.colors, ["白色", "黑色"]);
  assert.equal(row.productImagePaths.length, 1);
  assert.equal(row.poseImagePaths.length, 3);
  assert.equal(row.garmentProfile.primaryCategory, "上衣");
  assert.equal(row.garmentProfile.secondaryCategory, "针织衫");
  assert.equal(row.designLevel, "complex");
});

test("分类系统覆盖要求的主要服装类别", () => {
  assert.deepEqual(classifyGarment("牛仔阔腿裤"), { primaryCategory: "裤子", secondaryCategory: "阔腿裤", confidence: 0.78 });
  assert.equal(classifyGarment("女士连衣裙").primaryCategory, "裙子");
  assert.equal(classifyGarment("防风夹克外套").primaryCategory, "外套");
  assert.equal(classifyGarment("比基尼泳装").primaryCategory, "泳装");
  assert.equal(classifyGarment("运动套装").primaryCategory, "运动服");
  assert.equal(operationalProductType(classifyGarment("半身裙")), "半身裙");
});

test("任务类型、颜色与复杂度按制作要求自动判断", () => {
  assert.deepEqual(inferTaskTypes("白底高清产品展示图，领口局部修改"), ["白底图", "高清优化", "局部修改", "产品展示图"]);
  assert.deepEqual(parseColorNames("颜色：米白色 / 黑色；军绿色\n驼色"), ["米白色", "黑色", "军绿色", "驼色"]);
  assert.equal(inferDesignLevel("纯色基础款"), "simple");
  assert.equal(inferDesignLevel("撞色条纹和拼接包边"), "complex");
  assert.equal(inferDesignLevel("普通款"), "needs_review");
});

test("缺少关键字段不会猜测而是进入人工确认", () => {
  const row = normalizeSkuRow({ "商品名称": "未知商品" }, 8);
  assert.ok(row.issues.includes("缺少 SKU / 货号"));
  assert.ok(row.issues.includes("缺少商品图片路径"));
  assert.ok(row.issues.some((issue) => issue.includes("任务类型")));
});
