// 用于区分旧版“只看坐标”的裁图与新版“逐张查看实际裁片”的语义审核结果。
// 前端只会自动展示当前版本尚未人工确认的 AI 裁图；人工上传、人工框选和
// 已人工确认的历史裁图不受版本变化影响。
export const PRODUCT_VISUAL_ANALYSIS_VERSION = "visual-region-v4-semantic-crop-audit";
