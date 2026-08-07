import type {Metadata} from "next";
import SiteHeader from "@/components/portfolio/SiteHeader";
import SiteFooter from "@/components/portfolio/SiteFooter";
export const metadata:Metadata={title:"Contact"};
export default function ContactPage(){return <div className="portfolio-site"><SiteHeader/><main className="site-container inner-page contact-page"><header className="inner-hero"><p>Contact / Open to work</p><h1>Let&apos;s build<br/>something useful.</h1><p>适合跨境电商 AIGC 视觉、AI 商品图流程与视觉工作台相关合作。</p></header><section className="contact-list"><div><span>01</span><p>Email</p><strong>邮箱待补充</strong></div><div><span>02</span><p>Phone</p><strong>电话待补充</strong></div><div><span>03</span><p>Social</p><strong>社交账号待补充</strong></div><a href="/resume/chen-jingyu-resume.txt" download><span>04</span><p>Résumé</p><strong>下载文字版简历 ↓</strong></a></section><p className="contact-note">为避免展示虚假联系方式，邮箱、电话与社交账号目前明确标为待补充。</p></main><SiteFooter/></div>}
