/**
 * 只重试确实可能自行恢复的生图错误。
 *
 * 4xx 通常代表请求、权限或网关主动终止。继续提交既不会更快，还可能
 * 重复扣费；仅 408（请求超时）和 429（临时限流）允许重试。
 */
export function isRetryableGenerationError(message: string) {
  const httpStatus = message.match(/HTTP\s*(\d{3})/i)?.[1];
  if (httpStatus) {
    const status = Number(httpStatus);
    if (status >= 400 && status < 500) return status === 408 || status === 429;
    if (status >= 500) return true;
  }
  return /fetch failed|无法连接|connect(?:ion)? timed? ?out|请求超时|not valid json|不是有效 JSON/i.test(
    message,
  );
}
