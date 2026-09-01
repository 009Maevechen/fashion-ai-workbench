import test from "node:test";
import assert from "node:assert/strict";
import { formatDateTime, formatDate } from "../src/lib/date-format";

test("formatDateTime 输出固定格式 YYYY/MM/DD HH:mm:ss，与服务端客户端一致", () => {
  const result = formatDateTime("2026-08-30T09:05:07.000Z");
  assert.match(result, /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
});

test("formatDateTime 补零，避免服务端与客户端 toLocaleString 不一致导致 hydration mismatch", () => {
  // 2026-01-02 03:04:05 本地时间
  const local = new Date(2026, 0, 2, 3, 4, 5);
  assert.equal(formatDateTime(local.toISOString()), "2026/01/02 03:04:05");
});

test("formatDateTime 处理无效日期返回空字符串", () => {
  assert.equal(formatDateTime("invalid"), "");
  assert.equal(formatDate("not-a-date"), "");
});

test("formatDate 输出 YYYY/MM/DD", () => {
  const local = new Date(2026, 11, 25, 23, 59, 59);
  assert.equal(formatDate(local.toISOString()), "2026/12/25");
});
