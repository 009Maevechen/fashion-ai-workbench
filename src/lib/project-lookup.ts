export function findProjectByRouteKey<T extends {id:string;sku:string}>(projects:T[],routeKey:string){
  const decoded=decodeURIComponent(routeKey).trim();
  return projects.find(project=>project.id===decoded)||projects.find(project=>project.sku===decoded);
}
