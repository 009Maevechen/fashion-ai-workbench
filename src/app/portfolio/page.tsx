import Link from "next/link";
import { featuredProjects, workflowSteps } from "@/content/portfolio";
import PlaceholderArt from "@/components/portfolio/PlaceholderArt";
import Reveal from "@/components/portfolio/Reveal";
import SiteFooter from "@/components/portfolio/SiteFooter";
import SiteHeader from "@/components/portfolio/SiteHeader";

export const metadata = {
  title: "陈靖俞作品集",
  description: "跨境电商 AIGC 视觉设计与 AI 工作流搭建作品集。",
};

export default function PortfolioHome(){
  return <div className="portfolio-site">
    <SiteHeader />
    <main>
      <section className="site-hero site-container">
        <div className="hero-kicker"><span>陈靖俞</span><span>Portfolio / 2026</span></div>
        <h1>AI Visual Designer<br/><span>&amp; Workflow Builder</span></h1>
        <div className="hero-bottom">
          <p className="hero-position">跨境电商AIGC视觉设计<br/>AI工作流搭建</p>
          <div className="hero-statement"><p>把AI从一次性生图，转化为可复用的跨境商品视觉工作流</p><div className="hero-actions"><Link className="site-button" href="#selected-work">查看精选项目</Link><a className="site-button text" href="/resume/chen-jingyu-resume.txt" download>下载简历 ↓</a></div></div>
        </div>
      </section>
      <Reveal as="section" className="workflow-story site-container" id="workflow">
        <div className="section-heading"><p>01 / Workflow</p><h2>从业务问题到<br/>可交付图像</h2></div>
        <ol className="workflow-list">{workflowSteps.map((step,index)=><li key={step}><span>{String(index+1).padStart(2,"0")}</span><strong>{step}</strong><i aria-hidden="true">↓</i></li>)}</ol>
      </Reveal>
      <section className="selected-work site-container" id="selected-work">
        <div className="section-heading"><p>02 / Selected work</p><h2>四个项目，<br/>一条能力主线</h2><Link href="/work">查看全部项目 ↗</Link></div>
        <div className="project-list">{featuredProjects.map((project,index)=><Reveal as="article" className={`project-row project-row-${index+1}`} key={project.slug}>
          <Link className="project-visual" href={`/work/${project.slug}`} aria-label={`查看项目：${project.title}`}><PlaceholderArt label={project.placeholderLabel} index={index+1}/></Link>
          <div className="project-copy"><p className="project-index">{String(index+1).padStart(2,"0")} / {project.year}</p><h3><Link href={`/work/${project.slug}`}>{project.title}</Link></h3><p>{project.summary}</p><div className="project-tags">{project.tags.map(tag=><span key={tag}>{tag}</span>)}</div><Link className="project-link" href={`/work/${project.slug}`}>查看项目 <span>↗</span></Link></div>
        </Reveal>)}</div>
      </section>
      <Reveal as="section" className="capabilities site-container">
        <div className="section-heading"><p>03 / Capabilities</p><h2>视觉设计与流程搭建，<br/>不是两套分开的能力。</h2></div>
        <div className="capability-grid"><article><span>Visual</span><h3>跨境商品视觉</h3><p>模特商品图、换装、复色、姿势扩展与细节质检。</p></article><article><span>System</span><h3>AI Workflow</h3><p>从扣子框架验证，到 Codex 辅助搭建可复用工作台。</p></article><article><span>Quality</span><h3>生成结果控制</h3><p>把提示词、参考图、人工审核与失败迭代纳入流程。</p></article></div>
      </Reveal>
    </main>
    <SiteFooter />
  </div>;
}
