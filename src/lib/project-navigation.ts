export function projectModuleHref(segment:string,currentProjectId:string,projectIds:string[],projectsLoaded:boolean){
  if(!projectsLoaded)return null;
  const projectId=currentProjectId||projectIds[0];
  return projectId?`/projects/${projectId}/${segment}`:null;
}
