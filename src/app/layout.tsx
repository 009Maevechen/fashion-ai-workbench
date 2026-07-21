import "./globals.css";
import "./workflow.css";
import "./header.css";
import AppChrome from "@/components/AppChrome";
import { Suspense } from "react";

export const metadata = { title: "AI 服装工作台", description: "服装换装、姿势与复色生产流程" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body><Suspense fallback={<main className="app-main">{children}</main>}><AppChrome>{children}</AppChrome></Suspense></body></html>;
}
