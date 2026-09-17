"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";

const links=[{href:"/work",label:"Work"},{href:"/about",label:"About"},{href:"/contact",label:"Contact"}];
export default function SiteHeader(){
  const [open,setOpen]=useState(false);const pathname=usePathname();
  useEffect(()=>setOpen(false),[pathname]);
  return <header className="site-header"><Link className="site-logo" href="/portfolio" aria-label="陈靖俞作品集首页">CYJ<span>®</span></Link><button className="menu-toggle" type="button" aria-expanded={open} aria-controls="site-nav" onClick={()=>setOpen(value=>!value)}>{open?"Close":"Menu"}</button><nav id="site-nav" className={open?"site-nav open":"site-nav"} aria-label="主导航">{links.map(link=><Link key={link.href} href={link.href} className={pathname.startsWith(link.href)?"active":""}>{link.label}</Link>)}</nav></header>;
}
