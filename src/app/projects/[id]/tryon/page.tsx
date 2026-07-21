import ProjectWorkspacePage from "@/components/ProjectWorkspacePage";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){return <ProjectWorkspacePage id={(await params).id} step={2}/>}
