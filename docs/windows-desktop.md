# Windows 桌面版

## 架构与安全

Electron 主进程使用自带的 Node 运行时启动 Next.js standalone 服务，动态选择 `127.0.0.1` 端口，等待 `/api/health` 成功后才显示窗口。用户不需要安装 Node.js。窗口关闭时先优雅结束服务，4 秒后使用 Windows `taskkill /T /F` 清理完整进程树。

BrowserWindow 禁用 Node 集成，启用上下文隔离、sandbox 和 webSecurity。preload 只提供版本/平台信息以及打开输出、数据、日志目录的功能，不暴露 `ipcRenderer`。外部 HTTP/HTTPS 链接交给系统浏览器，其他导航被拒绝。

## 数据位置

- 项目、任务、姿势库索引和设置：`%APPDATA%\AI服装工作台\data`
- 生成图片和姿势库图片：`%用户图片%\AI服装工作台\outputs`
- 日志：`%APPDATA%\AI服装工作台\logs`

这些目录不在安装目录内，更新或重装不会覆盖。完整卸载后如需删除所有数据，请手动删除上述两个目录。备份时直接复制这两个目录。

API Key 不进入安装包。Electron `safeStorage` 保护本机加密秘密，Next.js 用该秘密对 Provider Key 进行 AES-256-GCM 加密。前端 API 只返回是否已配置和脱敏末尾。未配置 API 时工作台仍可启动，只有真实生成请求会报配置错误。

## 开发和构建

```text
pnpm dev             # 原网页开发模式
pnpm dev:electron    # Electron 开发窗口
pnpm build:desktop   # Next standalone + 桌面运行目录
pnpm make:win        # Windows x64 Squirrel 安装包
```

macOS 上可完成代码检查和 standalone 构建，但正式 Setup.exe 由 GitHub Actions 的 `windows-latest` 产生。在 GitHub 打开 Actions → Build Windows → Run workflow，成功后下载 `ai-fashion-workbench-windows-x64`，解压后获得 `AI服装工作台 Setup.exe`。

内测版未代码签名，Windows 可能显示“未知发布者”或 SmartScreen 提示。这不应通过关闭 Windows 安全功能来规避。

## 旧开发数据与排查

第一版不会自动扫描电脑或搬运开发目录。导入前请先备份项目中的 `data` 和 `outputs`；当前尚未提供界面化去重导入器，不建议手动覆盖桌面数据。

无法启动时，使用帮助菜单打开日志目录，查看 `desktop.log`。日志会脱敏 API Key 和 Base64 图片。
