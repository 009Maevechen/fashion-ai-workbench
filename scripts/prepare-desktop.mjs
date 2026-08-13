import fs from "node:fs/promises";
import path from "node:path";

const root=process.cwd(),source=path.join(root,".next","standalone"),target=path.join(root,"desktop-runtime");
const portfolioRoute=route=>route==="/"||route==="/work"||route.startsWith("/work/")||route==="/about"||route==="/contact";
const portfolioPageKey=key=>key==="/page"||key==="/work/page"||key.startsWith("/work/")||key==="/about/page"||key==="/contact/page";
async function readJson(file){return JSON.parse(await fs.readFile(file,"utf8"))}
async function writeJson(file,value){await fs.writeFile(file,`${JSON.stringify(value,null,2)}\n`)}
async function alignSharpRuntime(){
  // pnpm may expose a newer top-level @img package alongside sharp 0.33.x.
  // Next's file tracer can then copy the newer native binary into standalone,
  // producing a JS/native ABI mismatch (valid images fail with TypeError).
  const matchingImg=path.join(root,"node_modules","sharp","node_modules","@img");
  const runtimeImg=path.join(target,"node_modules","@img");
  await fs.access(matchingImg).catch(()=>{throw new Error("找不到与 sharp 匹配的原生图片运行库")});
  await fs.rm(runtimeImg,{recursive:true,force:true});
  await fs.cp(matchingImg,runtimeImg,{recursive:true});
}
async function verifyImageRuntime(){
  const required=[
    path.join(target,"node_modules","sharp","package.json"),
    path.join(target,"node_modules","heic-convert","package.json"),
    path.join(target,"node_modules","libheif-js","package.json"),
  ];
  for(const file of required)await fs.access(file).catch(()=>{throw new Error(`桌面运行目录缺少图片解码依赖：${path.relative(target,file)}`)});
}
async function prunePortfolio(){
  const next=path.join(target,".next"),server=path.join(next,"server"),app=path.join(server,"app");
  const appPathsFile=path.join(server,"app-paths-manifest.json"),appPaths=await readJson(appPathsFile);
  for(const key of Object.keys(appPaths))if(portfolioPageKey(key))delete appPaths[key];
  await writeJson(appPathsFile,appPaths);

  const routeMapFile=path.join(next,"app-path-routes-manifest.json"),routeMap=await readJson(routeMapFile);
  for(const [key,route] of Object.entries(routeMap))if(portfolioPageKey(key)||portfolioRoute(route))delete routeMap[key];
  await writeJson(routeMapFile,routeMap);

  const buildManifestFile=path.join(next,"app-build-manifest.json"),buildManifest=await readJson(buildManifestFile);
  const removedChunks=new Set(),keptChunks=new Set();
  for(const [key,chunks] of Object.entries(buildManifest.pages)){
    if(portfolioPageKey(key)){for(const chunk of chunks)removedChunks.add(chunk);delete buildManifest.pages[key]}
    else for(const chunk of chunks)keptChunks.add(chunk);
  }
  await writeJson(buildManifestFile,buildManifest);
  for(const chunk of removedChunks)if(!keptChunks.has(chunk))await fs.rm(path.join(next,chunk),{force:true});

  const routesFile=path.join(next,"routes-manifest.json"),routes=await readJson(routesFile);
  routes.staticRoutes=(routes.staticRoutes||[]).filter(item=>!portfolioRoute(item.page));
  routes.dynamicRoutes=(routes.dynamicRoutes||[]).filter(item=>!portfolioRoute(item.page));
  await writeJson(routesFile,routes);

  const prerenderFile=path.join(next,"prerender-manifest.json"),prerender=await readJson(prerenderFile);
  for(const key of Object.keys(prerender.routes||{}))if(portfolioRoute(key))delete prerender.routes[key];
  for(const key of Object.keys(prerender.dynamicRoutes||{}))if(portfolioRoute(key))delete prerender.dynamicRoutes[key];
  await writeJson(prerenderFile,prerender);

  await Promise.all([
    fs.rm(path.join(app,"work"),{recursive:true,force:true}),
    fs.rm(path.join(app,"about"),{recursive:true,force:true}),
    fs.rm(path.join(app,"contact"),{recursive:true,force:true}),
    fs.rm(path.join(target,"public","resume"),{recursive:true,force:true}),
    ...["page.js","page.js.nft.json","page_client-reference-manifest.js","index.html","index.meta","index.rsc","work.html","work.meta","work.rsc","about.html","about.meta","about.rsc","contact.html","contact.meta","contact.rsc"].map(file=>fs.rm(path.join(app,file),{force:true})),
  ]);
  if(Object.keys(appPaths).some(portfolioPageKey))throw new Error("桌面运行目录仍包含作品集路由");
  console.log("Portfolio routes removed from desktop runtime");
}
await fs.access(path.join(source,"server.js"));
await fs.rm(target,{recursive:true,force:true});
await fs.cp(source,target,{recursive:true});
await alignSharpRuntime();
await verifyImageRuntime();
await fs.mkdir(path.join(target,".next"),{recursive:true});
await fs.cp(path.join(root,".next","static"),path.join(target,".next","static"),{recursive:true});
try{await fs.cp(path.join(root,"public"),path.join(target,"public"),{recursive:true})}catch(error){if(error?.code!=="ENOENT")throw error}
await prunePortfolio();
console.log(`Desktop runtime prepared at ${target}`);
