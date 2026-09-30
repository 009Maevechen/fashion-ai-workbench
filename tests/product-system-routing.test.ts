import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { PRODUCT_SYSTEMS, productSearchUrl, isAllowedProductImageUrl } = require("../electron/product-systems.cjs") as {
  PRODUCT_SYSTEMS: Array<{ id: string; origin: string; productUrl: string }>;
  productSearchUrl: (system: { productUrl: string }, sku: string) => string;
  isAllowedProductImageUrl: (url: string, sourceId?: string) => boolean;
};

test("货号查询严格按主系统再备用系统执行", () => {
  assert.deepEqual(PRODUCT_SYSTEMS.map((system) => system.id), ["cocomoda", "tooerp-us"]);
  assert.match(productSearchUrl(PRODUCT_SYSTEMS[0], "JR00507"), /productNumber=JR00507/);
  assert.match(productSearchUrl(PRODUCT_SYSTEMS[1], "XM02092"), /productNumber=XM02092/);
});

test("只允许两个商品系统的高清资源地址进入工作台", () => {
  assert.equal(isAllowedProductImageUrl("https://cocomoda.tooerp.com/be/statics/resources/a.jpg"), true);
  assert.equal(isAllowedProductImageUrl("https://us.tooerp.com/be/statics/resources/b.jpg"), true);
  assert.equal(isAllowedProductImageUrl("https://usimg.k2049.com/files/x/82567c18700f4bf0bac2f845f9a7595f.jpg", "tooerp-us"), true);
  assert.equal(isAllowedProductImageUrl("https://usimg.k2049.com/files/t/82567c18700f4bf0bac2f845f9a7595f.jpg", "tooerp-us"), true);
  assert.equal(isAllowedProductImageUrl("https://us.tooerp.com/82567c18700f4bf0bac2f845f9a7595f.jpg", "cocomoda"), false);
  assert.equal(isAllowedProductImageUrl("https://usimg.k2049.com/profile", "tooerp-us"), false);
  assert.equal(isAllowedProductImageUrl("https://cocomoda.tooerp.com/not-an-image"), false);
  assert.equal(isAllowedProductImageUrl("https://example.com/be/statics/resources/a.jpg"), false);
  assert.equal(isAllowedProductImageUrl("https://us.tooerp.com/profile"), false);
});

test("商品图导入只对固定官方域名使用受控下载白名单", () => {
  const importer = readFileSync(new URL("../src/app/api/product-source/import/route.ts", import.meta.url), "utf8");
  const storage = readFileSync(new URL("../src/lib/ai/storage.ts", import.meta.url), "utf8");
  assert.match(importer, /downloadAllowlistedImage/);
  assert.match(importer, /\["us\.tooerp\.com", "usimg\.k2049\.com"\]/);
  assert.match(importer, /\["cocomoda\.tooerp\.com"\]/);
  assert.match(storage, /if\(!allowed\.has\(hostname\)\)throw new Error\("商品图片跳转到了未授权的资源域名"\)/);
});

test("单站查询只提交一次搜索表单，不因页面未显示货号而重复点击", () => {
  const source = readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(source, /let formSubmitted=false/);
  assert.match(source, /if\(!formSubmitted&&state\.hasSearchForm&&attempt>=1\)/);
  assert.doesNotMatch(source, /if\(state\.searchTriggered\)/);
});

test("商品系统内部路由取消不会被误判为货号不存在", () => {
  const source = readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(source, /function isAbortedNavigation/);
  assert.match(source, /if\(!isAbortedNavigation\(error\)\)throw error/);
  assert.match(source, /connectionSystems\.length\?"connection_failed"/);
});

test("自动查询和手动点击共用同一个防重入锁", () => {
  const source = readFileSync(new URL("../src/components/SpreadsheetProductionEntry.tsx", import.meta.url), "utf8");
  assert.match(source, /const lookupInFlight = useRef\(false\)/);
  assert.match(source, /if \(lookupInFlight\.current\) return/);
  assert.match(source, /lookupInFlight\.current = false/);
});

test("货号图片必须来自文字完全匹配的同一商品行且只返回一张", () => {
  const source = readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(source, /normalize\(el\.textContent\)===targetSku/);
  assert.match(source, /const exactRow=exactSkuElement\?\.closest/);
  assert.match(source, /const exactRowIndex=exactRow\?exactSiblings\.indexOf\(exactRow\):-1/);
  assert.match(source, /const relatedRows=exactRow\?\[exactRow/);
  assert.match(source, /relatedRows\.flatMap\(\(row\)=>\[\.\.\.row\.querySelectorAll\("img,a,\[style\*='background-image'\]"\)\]\)/);
  assert.match(source, /el\.getAttribute\?\.\("alt"\)/);
  assert.match(source, /right\.includes\("\/files\/x\/"\)/);
  assert.match(source, /if\(state\.exactMatch&&urls\.length\)return \{ok:true,exactMatch:true,sku,urls:\[urls\[0\]\]/);
  assert.doesNotMatch(source, /querySelectorAll\("img, a"\)/);
});
