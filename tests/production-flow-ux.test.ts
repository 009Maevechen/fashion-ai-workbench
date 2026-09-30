import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("项目步骤由网址决定，切换 SKU 恢复待处理步骤", () => {
  const workspace = source("../src/components/Workspace.tsx");
  const chrome = source("../src/components/AppChrome.tsx");
  const projectList = source("../src/components/ProjectList.tsx");
  assert.match(workspace, /projectStepFromPath\(pathname/);
  assert.doesNotMatch(workspace, /setStep\(/);
  assert.match(chrome, /navigate\(projectResumeHref\(project\)\)/);
  assert.match(projectList, /router\.push\(projectResumeHref\(project\)\)/);
});

test("返回工作台按 SKU 还原筛选并使用双系统货号直查", () => {
  const list = source("../src/components/ProjectList.tsx");
  const lookup = source("../src/components/SpreadsheetProductionEntry.tsx");
  const page = source("../src/app/workbench/page.tsx");
  assert.match(list, /search\.get\("sku"\)/);
  assert.match(list, /id="sku-project-list"/);
  assert.match(lookup, /COCO MODA 商品系统/);
  assert.match(lookup, /美国商品系统/);
  assert.match(lookup, /lookupProduct\(sku\)/);
  assert.doesNotMatch(page, /listSpreadsheetImports/);
  assert.doesNotMatch(lookup, /导入 WPS \/ Excel 商品表格/);
});

test("商品系统查询成功后自动保存产品图、建立 SKU 并启动服装分析", () => {
  const lookup = source("../src/components/SpreadsheetProductionEntry.tsx");
  const importer = source("../src/app/api/product-source/import/route.ts");
  const workspace = source("../src/components/Workspace.tsx");
  const analyzer = source("../src/app/api/projects/[id]/product-analyze/route.ts");
  assert.match(lookup, /\/api\/product-source\/import/);
  assert.match(lookup, /autoAnalyze=1/);
  assert.doesNotMatch(lookup, /await fetch\(`\/api\/projects\/\$\{data\.projectId\}\/product-analyze/);
  assert.match(workspace, /\/product-analyze/);
  assert.match(analyzer, /mergeProductProfileAnalysis/);
  assert.match(lookup, /rawResult\.exactMatch === true/);
  assert.match(lookup, /只返回该货号的 1 张高清图/);
  assert.match(importer, /createProject/);
  assert.match(importer, /https:\/\/cocomoda\.tooerp\.com/);
  assert.match(importer, /https:\/\/us\.tooerp\.com/);
});

test("商品系统导入后在资料页使用高清图自动识别并回填详细字段", () => {
  const details = source("../src/components/workbench/ProductDetailsPanel.tsx");
  const analysis = source("../src/lib/ai/product-analysis.ts");
  assert.match(details, /autoAnalyze/);
  assert.match(details, /setProfile\(/);
  assert.match(analysis, /resizeToJpeg\(input, 1600, 90\)/);
  assert.match(analysis, /唯一事实来源并放大逐区域检查/);
});

test("商品资料保存选择不被后台自动保存覆盖，刷新仍有保护层", () => {
  const details = source("../src/components/workbench/ProductDetailsPanel.tsx");
  const guard = source("../src/components/workbench/ProductionNavigationGuard.tsx");
  const layout = source("../src/app/layout.tsx");
  assert.doesNotMatch(details, /useProjectDraftAutosave/);
  assert.match(details, /register\(\{dirty:!saved,save:/);
  for (const label of ["取消", "不保存并离开", "保存并离开"]) assert.match(guard, new RegExp(label));
  assert.match(guard, /beforeunload/);
  assert.match(layout, /<ProductionNavigationGuard><Suspense/);
});
