// 统一的日期时间格式化：避免服务端渲染与客户端水合时 toLocaleString 输出不一致，
// 导致 React hydration mismatch 进而使页面点击事件失效。
// 固定输出格式：YYYY/MM/DD HH:mm:ss（使用本地时间，但格式确定，不依赖运行环境 locale）。
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}
