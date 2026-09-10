import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tryonPanel = readFileSync(
  new URL("../src/components/workbench/TryonPanel.tsx", import.meta.url),
  "utf8",
);
const resultCard = readFileSync(
  new URL("../src/components/workbench/ResultCard.tsx", import.meta.url),
  "utf8",
);

test("换装候选图只保留一个命令修改入口", () => {
  assert.doesNotMatch(
    tryonPanel,
    /工作台智能修改|revisionRequest|revisionMessages|reviseCandidate/,
  );
  assert.match(resultCard, /✨ 咒语矫正/);
  assert.match(resultCard, /确认规则并强制执行/);
});
