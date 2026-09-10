import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(
  new URL("../src/app/workbench/page.tsx", import.meta.url),
  "utf8",
);
const projectList = readFileSync(
  new URL("../src/components/ProjectList.tsx", import.meta.url),
  "utf8",
);
const projectHeader = readFileSync(
  new URL("../src/components/workbench/ProjectHeader.tsx", import.meta.url),
  "utf8",
);
const recolorPanel = readFileSync(
  new URL("../src/components/workbench/RecolorPanel.tsx", import.meta.url),
  "utf8",
);
const globalStyles = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);
const workflowStyles = readFileSync(
  new URL("../src/app/workflow.css", import.meta.url),
  "utf8",
);
const appChrome = readFileSync(
  new URL("../src/components/AppChrome.tsx", import.meta.url),
  "utf8",
);
const electronMain = readFileSync(
  new URL("../electron/main.cjs", import.meta.url),
  "utf8",
);

test("工作台首页和项目页使用明确的信息层级", () => {
  assert.match(home, /workbench-home/);
  assert.match(home, /workbench-stats/);
  assert.match(projectList, /project-create-action/);
  assert.match(projectList, /project-row-actions/);
  assert.match(projectHeader, /section-kicker/);
  assert.match(projectHeader, /aria-current=\{number===step\?"step"/);
  assert.match(globalStyles, /工作台视觉层级 v1/);
  assert.match(workflowStyles, /制作流程统一层级/);
});

test("颜色调整浮层支持拖动且保留可恢复入口", () => {
  assert.match(recolorPanel, /onPointerDown=\{startPaletteDrag\}/);
  assert.match(recolorPanel, /onPointerMove=\{movePalette\}/);
  assert.match(recolorPanel, /onPointerUp=\{stopPaletteDrag\}/);
  assert.match(recolorPanel, /拖动此处移动 · 双击居中/);
  assert.match(workflowStyles, /\.recolor-drag-handle/);
  assert.match(
    workflowStyles,
    /\.recolor-control-card\.palette-open::before\s*\{[^}]*pointer-events:\s*none/s,
  );
});

test("Windows 桌面安装包启用独立界面适配和系统身份", () => {
  assert.match(appChrome, /getAppInfo/);
  assert.match(appChrome, /desktop-platform-win32/);
  assert.match(globalStyles, /Windows 桌面安装包/);
  assert.match(globalStyles, /Segoe UI Variable/);
  assert.match(globalStyles, /@media \(forced-colors: active\)/);
  assert.match(electronMain, /setAppUserModelId\("com\.ai-fashion-workbench\.desktop"\)/);
});
