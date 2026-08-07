import "./globals.css";
import "./workflow.css";
import "./header.css";
import "./portfolio.css";
import RootShell from "@/components/RootShell";
import { Suspense } from "react";

export const metadata = {
  title: { default: "电商服饰AI工作流", template: "%s｜电商服饰AI工作流" },
  description: "跨境电商 AIGC 视觉设计与 AI 工作流搭建作品集。",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body><Suspense fallback={<main>{children}</main>}><RootShell>{children}</RootShell></Suspense></body></html>;
}
