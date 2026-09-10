import test from "node:test";
import assert from "node:assert/strict";
import { isRetryableGenerationError } from "../src/lib/generation-retry";

test("明确的客户端或网关中止不会重复生图", () => {
    assert.equal(
      isRetryableGenerationError(
        "SYC 中转站返回的不是有效 JSON（HTTP 499，未知类型）",
      ),
      false,
    );
    assert.equal(isRetryableGenerationError("SYC 请求失败（HTTP 400）"), false);
});

test("可恢复的网络、超时、限流和服务端错误允许重试", () => {
    assert.equal(isRetryableGenerationError("fetch failed"), true);
    assert.equal(isRetryableGenerationError("请求超时"), true);
    assert.equal(isRetryableGenerationError("HTTP 408"), true);
    assert.equal(isRetryableGenerationError("HTTP 429"), true);
    assert.equal(isRetryableGenerationError("HTTP 503"), true);
});
