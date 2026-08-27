import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(projectRoot);

const PORT = process.env.PORT || "3000";

/**
 * 启动前清理残留的 Next.js 开发服务进程，避免端口占用导致新实例
 * 换端口（用户仍访问 3000 导致"打不开"）或旧进程抢占目录。
 */
function killStaleNextProcesses() {
  try {
    if (process.platform === "win32") {
      try {
        execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'next dev|next-server' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: "ignore" });
      } catch { /* 无残留进程或命令不可用 */ }
    } else {
      try {
        execSync("pkill -f 'next dev'", { stdio: "ignore" });
        execSync("pkill -f 'next-server'", { stdio: "ignore" });
      } catch { /* 无残留进程 */ }
    }
  } catch { /* 清理失败不阻断启动 */ }
}

killStaleNextProcesses();

// 短暂等待端口释放
await new Promise((resolve) => setTimeout(resolve, 800));

const child = spawn(
  process.execPath,
  [path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", PORT],
  {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-dev", PORT },
  },
);

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
