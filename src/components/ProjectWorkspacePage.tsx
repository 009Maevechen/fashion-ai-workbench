import {notFound} from "next/navigation";
import {getProject,listJobs} from "@/lib/db";
import {providerHealth} from "@/lib/ai/config";
import {getWorkflowRuntimeSummary} from "@/lib/ai/provider-settings";
import Workspace from "@/components/Workspace";

export default async function ProjectWorkspacePage({id,step}:{id:string;step?:number}){
  const project=await getProject(id);
  if(!project)notFound();
  const [initialJobs,modelRouting]=await Promise.all([listJobs({projectId:project.id}),getWorkflowRuntimeSummary()]);
  return <Workspace initial={project} initialJobs={initialJobs} health={providerHealth()} modelRouting={modelRouting} initialStep={step}/>;
}
