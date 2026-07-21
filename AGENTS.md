# 项目开发规则

- 不推倒重构现有项目，不删除现有可用功能，优先复用现有组件。
- 修改前检查 Git 状态，不覆盖用户未提交代码。
- 所有第三方 API 必须由服务端调用；API Key 不得暴露在前端或保存在 LocalStorage。
- 生成失败不得返回输入原图，不得使用固定测试图冒充生成结果。
- 图片生成结果必须持久化保存；错误必须显示真实原因。
- 每个模块结束必须运行类型检查、lint 和 build。
- 不擅自增加未要求的功能。

## 实际命令（pnpm）

- 安装：`pnpm install`
- 开发：`pnpm dev`
- 类型检查：`pnpm typecheck`
- Lint：`pnpm lint`
- 构建：`pnpm build`
- 生产启动：`pnpm start`
- 测试：`pnpm test`
