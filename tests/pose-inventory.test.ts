import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/lib/table-parse";
import { normalizeProductType, normalizeShot, normalizeFace, recommendGroups, searchGroups } from "../src/lib/pose-inventory-utils";

type PoseInventoryGroup = {
  id: string;
  poseGroupId: string;
  folderName: string;
  folderRelativePath: string;
  productType?: string;
  productSubtype?: string;
  displayFocus?: string;
  shotType?: string;
  faceVisible?: boolean;
  tags?: string;
};

test("CSV 解析带引号字段", () => {
  const csv = "姿势组ID,文件夹名称,商品类型,标签\nPANTS_001,PANTS_001,裤装,\"阔腿,全身\"\nTOP_001,TOP_001,上衣,条纹\n";
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["文件夹名称"], "PANTS_001");
  assert.equal(rows[0]["标签"], "阔腿,全身");
});

test("CSV 解析跳过空行", () => {
  const csv = "a,b\n1,2\n\n\n3,4\n";
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
});

test("商品类型归一化", () => {
  assert.equal(normalizeProductType("裤装"), "裤装");
  assert.equal(normalizeProductType("PANTS"), "裤装");
  assert.equal(normalizeProductType("Dress"), "连衣裙");
  assert.equal(normalizeProductType("上衣"), "上衣");
});

test("景别与露脸归一化", () => {
  assert.equal(normalizeShot("全身"), "全身");
  assert.equal(normalizeShot("half"), "半身");
  assert.equal(normalizeFace("是"), true);
  assert.equal(normalizeFace("不露脸"), false);
  assert.equal(normalizeFace("hidden"), false);
});

function makeGroup(overrides: Partial<PoseInventoryGroup>): PoseInventoryGroup {
  return {
    id: overrides.poseGroupId || "g1",
    poseGroupId: overrides.poseGroupId || "g1",
    folderName: overrides.folderName || "g1",
    folderRelativePath: overrides.folderName || "g1",
    productType: "裤装",
    productSubtype: "阔腿裤",
    displayFocus: "裤型/腰头",
    shotType: "全身",
    faceVisible: false,
    tags: "阔腿,全身,不露脸",
    ...overrides,
  };
}

test("规则推荐按匹配度排序", () => {
  const groups = [
    makeGroup({ poseGroupId: "A", productSubtype: "阔腿裤" }),
    makeGroup({ poseGroupId: "B", productSubtype: "直筒裤", shotType: "半身" }),
    makeGroup({ poseGroupId: "C", productType: "上衣", productSubtype: "衬衫" }),
  ];
  const result = recommendGroups(groups, { productType: "裤装", productSubtype: "阔腿裤", shotType: "全身", faceVisible: false });
  assert.ok(result.length >= 3);
  assert.equal(result[0].group.poseGroupId, "A");
  assert.ok(result[0].score >= result[1].score);
});

test("搜索按ID/类型/标签匹配", () => {
  const groups = [
    makeGroup({ poseGroupId: "PANTS_001", tags: "阔腿,全身" }),
    makeGroup({ poseGroupId: "TOP_001", productType: "上衣", tags: "条纹" }),
  ];
  assert.equal(searchGroups(groups, "PANTS", {}).length, 1);
  assert.equal(searchGroups(groups, "上衣", {}).length, 1);
  assert.equal(searchGroups(groups, "条纹", {}).length, 1);
  assert.equal(searchGroups(groups, "不存在的词", {}).length, 0);
});

test("筛选商品类型", () => {
  const groups = [
    makeGroup({ poseGroupId: "A", productType: "裤装" }),
    makeGroup({ poseGroupId: "B", productType: "上衣" }),
  ];
  const filtered = searchGroups(groups, "", { productType: "裤装" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].poseGroupId, "A");
});
