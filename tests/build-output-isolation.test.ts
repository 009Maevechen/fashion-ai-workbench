import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);

test("日常生产构建与开发服务使用不同的 Next.js 输出目录", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  // dev 通过启动脚本隔离输出目录（dev.mjs 内部使用 .next-dev），避免与 build 互相污染
  assert.match(packageJson.scripts.dev, /node scripts\/dev\.mjs/);
  assert.match(packageJson.scripts["dev:electron"], /NEXT_DIST_DIR=\.next-dev\b/);
  assert.match(packageJson.scripts.build, /NEXT_DIST_DIR=\.next-build\b/);
  assert.match(packageJson.scripts.start, /NEXT_DIST_DIR=\.next-build\b/);
  assert.doesNotMatch(packageJson.scripts.build, /NEXT_DIST_DIR=\.next(?:\s|$)/);
});

test("桌面打包仍显式使用原有输出目录", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(packageJson.scripts["build:desktop"], /NEXT_DIST_DIR=\.next\b/);
  assert.match(packageJson.scripts["build:desktop"], /prepare-desktop\.mjs/);
});

test("桌面运行目录不得递归打包历史安装包", async () => {
  const script = await readFile(new URL("../scripts/prepare-desktop.mjs", import.meta.url), "utf8");

  assert.match(script, /excludedStandaloneRoots/);
  assert.match(script, /"desktop-runtime"/);
  assert.match(script, /"out"/);
  assert.match(script, /filter:includeStandaloneRuntime/);
});

test("Electron 打包必须忽略输出目录和历史运行目录", async () => {
  const config = await readFile(new URL("../forge.config.cjs", import.meta.url), "utf8");
  const forge = require("../forge.config.cjs");
  const ignore = forge.packagerConfig.ignore as (filePath: string) => boolean;

  assert.match(config, /allowedApplicationRoots/);
  assert.match(config, /"electron"/);
  assert.match(config, /"package\.json"/);
  assert.match(config, /ignore:ignoreProjectArtifact/);
  assert.equal(ignore("/out"), true);
  assert.equal(ignore("desktop-runtime"), true);
  assert.equal(ignore("/.pnpm-store"), true);
  assert.equal(ignore("/.next-stability"), true);
  assert.equal(ignore("/src"), true);
  assert.equal(ignore("/electron"), false);
  assert.equal(ignore("/package.json"), false);
});

test("dev 启动脚本使用独立的 .next-dev 目录", async () => {
  const script = await readFile(new URL("../scripts/dev.mjs", import.meta.url), "utf8");
  assert.match(script, /NEXT_DIST_DIR[^\n]*\.next-dev/);
  assert.match(script, /next[\s\S]*dev/);
});

test("macOS 桌面启动直接等待本机端口并由页面加载完成最终校验", async () => {
  const main = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");

  assert.match(main, /waitForListeningPort/);
  assert.doesNotMatch(main, /function waitForHealth/);
  assert.match(main, /BrowserWindow\.loadURL below performs the final HTTP\/page/);
  assert.match(main, /setProxy\(\{mode:"direct"\}\)/);
  assert.match(main, /Workbench first navigation retry/);
  assert.match(main, /loadURL\(url\),4000/);
});

test("桌面工作台支持系统复制粘贴快捷键和右键菜单", async () => {
  const main = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");

  assert.match(main, /label:"编辑"/);
  assert.match(main, /role:"copy",label:"复制"/);
  assert.match(main, /role:"paste",label:"粘贴"/);
  assert.match(main, /role:"selectAll",label:"全选"/);
  assert.match(main, /webContents\.on\("context-menu"/);
});

test("macOS 关闭窗口后再点应用图标会重建工作台窗口", async () => {
  const main = await readFile(new URL("../electron/main.cjs", import.meta.url), "utf8");

  assert.match(main, /mainWindow\.on\("closed",\(\)=>\{mainWindow=null\}\)/);
  assert.match(main, /mainWindow&&!mainWindow\.isDestroyed\(\)/);
  assert.match(main, /else void createWindow\(\)/);
});
