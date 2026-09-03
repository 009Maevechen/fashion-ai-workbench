# 跨境电商服装 AI 美工工作台

Next.js 全栈工作台，支持商品项目、真实换装、三姿势生成、逐图复色、人工确认、历史记录和持久化下载。

## 启动

复制 `.env.example` 为 `.env.local` 并填写需要的服务端密钥，然后运行：

```bash
pnpm install
pnpm dev
```

项目数据保存在 `data/store.json`，上传和生成图片保存在 `outputs/`。两者默认不提交 Git。

可在“API与模型设置”页面新增 OpenAI 兼容中转站、FASHN、BFL、火山方舟、FLUX 或自定义兼容提供商，并分别为换装、三姿势、复色绑定主模型和备用模型。所有在页面填写的 API Key 统一加密保存在当前 Windows 用户的 `%APPDATA%\\AI服装工作台\\data\\model-settings.json`，解密钥匙由 Windows 安全存储保护；浏览器、LocalStorage 和日志只会收到或记录掩码。未设置页面绑定时，工作台继续使用 `.env.local` 中的原有 Provider 配置。

未配置 Provider 时，界面会显示明确配置错误，不会返回原图或测试图。
