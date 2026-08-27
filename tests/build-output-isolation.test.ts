import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("dev 启动脚本使用独立的 .next-dev 目录", async () => {
  const script = await readFile(new URL("../scripts/dev.mjs", import.meta.url), "utf8");
  assert.match(script, /NEXT_DIST_DIR[^\n]*\.next-dev/);
  assert.match(script, /next[\s\S]*dev/);
});
