import type {Metadata} from "next";
import Link from "next/link";
import {featuredProjects} from "@/content/portfolio";
import PlaceholderArt from "@/components/portfolio/PlaceholderArt";
import SiteHeader from "@/components/portfolio/SiteHeader";
import SiteFooter from "@/components/portfolio/SiteFooter";
export const metadata:Metadata={title:"Work"};
export default function WorkPage(){return <div className="portfolio-site"><SiteHeader/><main className="site-container inner-page"><header className="inner-hero"><p>Selected work / 2025–2026</p><h1>Work<span>04</span></h1><p>从商品视觉生产到信息设计，项目被组织为清晰、可解释、可复用的方法。</p></header><div className="work-index">{featuredProjects.map((project,index)=><Link href={`/work/${project.slug}`} className="work-index-row" key={project.slug}><span>{String(index+1).padStart(2,"0")}</span><div><PlaceholderArt label={project.placeholderLabel} index={index+1}/></div><h2>{project.title}</h2><p>{project.category}<br/>{project.year}</p><i>↗</i></Link>)}</div></main><SiteFooter/></div>}
