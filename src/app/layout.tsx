import "./globals.css";
import "./workflow.css";
import "./header.css";
import "./portfolio.css";
import RootShell from "@/components/RootShell";
import { Suspense } from "react";

export const metadata = {
  title: { default: "AI服装工作台", template: "%s｜AI服装工作台" },
  description: "跨境电商服装图片生产工作台。",
  icons: { icon: "/icon.png", apple: "/apple-touch-icon.png" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body><Suspense fallback={<main>{children}</main>}><RootShell>{children}</RootShell></Suspense></body></html>;
}
