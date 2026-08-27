import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("日常生产构建与开发服务使用不同的 Next.js 输出目录", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(packageJson.scripts.dev, /NEXT_DIST_DIR=\.next-dev\b/);
  assert.match(packageJson.scripts["dev:electron"], /NEXT_DIST_DIR=\.next-dev\b/);
  assert.match(packageJson.scripts.build, /NEXT_DIST_DIR=\.next-build\b/);
  assert.match(packageJson.scripts.start, /NEXT_DIST_DIR=\.next-build\b/);
  assert.doesNotMatch(packageJson.scripts.build, /NEXT_DIST_DIR=\.next(?:\s|$)/);
  assert.notEqual(
    packageJson.scripts.dev.match(/NEXT_DIST_DIR=([^\s]+)/)?.[1],
    packageJson.scripts.build.match(/NEXT_DIST_DIR=([^\s]+)/)?.[1],
  );
});

test("桌面打包仍显式使用原有输出目录", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(packageJson.scripts["build:desktop"], /NEXT_DIST_DIR=\.next\b/);
  assert.match(packageJson.scripts["build:desktop"], /prepare-desktop\.mjs/);
});
