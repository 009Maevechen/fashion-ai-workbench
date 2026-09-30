/* eslint-disable @typescript-eslint/no-require-imports */
const {app,BrowserWindow,Menu,clipboard,ipcMain,nativeImage,safeStorage,shell}=require("electron");
const {spawn,execFile}=require("node:child_process");
const crypto=require("node:crypto");
const fs=require("node:fs");
const fsp=require("node:fs/promises");
const net=require("node:net");
const path=require("node:path");
const {PRODUCT_SYSTEMS,productSystemById,productSearchUrl}=require("./product-systems.cjs");

app.setName("AI服装工作台");
if(process.platform==="win32"){
  app.setAppUserModelId("com.ai-fashion-workbench.desktop");
  // Windows 显卡驱动在同时解码大量高分辨率图片时可能拖垮整机。
  // 工作台不是 3D 应用，使用软件绘制更稳，缩略图仍由服务端生成。
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("js-flags","--max-old-space-size=768");
  app.commandLine.appendSwitch("disk-cache-size","134217728");
}
if(!app.requestSingleInstanceLock())app.quit();
let mainWindow=null,serverProcess=null,serverPort=null,quitting=false;
const productSystemWindows=new Map();
let recoveredLaunch=false;
const workbenchPrefixes=["/workbench","/projects/","/history","/libraries/","/settings"];

function directories(){
  const base=app.getPath("userData"),pictures=path.join(app.getPath("pictures"),"AI服装工作台");
  return {base,data:path.join(base,"data"),settings:path.join(base,"settings"),logs:path.join(base,"logs"),temp:path.join(base,"temp"),pictures,outputs:path.join(pictures,"outputs")};
}
const redact=value=>String(value).replace(/(api[_ -]?key|authorization|bearer)\s*[:=]?\s*[^\s,;]+/gi,"$1=[REDACTED]").replace(/data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/gi,"[BASE64_IMAGE]");
async function writeLog(message){try{const {logs}=directories();await fsp.mkdir(logs,{recursive:true});await fsp.appendFile(path.join(logs,"desktop.log"),`${new Date().toISOString()} ${redact(message)}\n`)}catch{}}
async function ensureDirectories(){for(const value of Object.values(directories()))await fsp.mkdir(value,{recursive:true})}
async function durableJson(file,value){const temporary=path.join(path.dirname(file),`.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);await fsp.mkdir(path.dirname(file),{recursive:true});const handle=await fsp.open(temporary,"wx",0o600);try{await handle.writeFile(`${JSON.stringify(value,null,2)}\n`);await handle.sync()}finally{await handle.close()}await fsp.rename(temporary,file);await fsp.unlink(temporary).catch(()=>{})}
async function markDesktopSession(state){const file=path.join(directories().settings,"session-state.json");if(state==="running"){try{const previous=JSON.parse(await fsp.readFile(file,"utf8"));recoveredLaunch=previous.state==="running"}catch{}await durableJson(file,{state:"running",pid:process.pid,startedAt:new Date().toISOString()})}else await durableJson(file,{state:"clean",closedAt:new Date().toISOString()})}
function findFreePort(){return new Promise((resolve,reject)=>{const socket=net.createServer();socket.unref();socket.on("error",reject);socket.listen(0,"127.0.0.1",()=>{const address=socket.address();socket.close(()=>resolve(address.port))})})}
async function getProviderSecret(){
  const file=path.join(directories().settings,"provider-secret.bin");
  try{return safeStorage.decryptString(await fsp.readFile(file))}catch{
    if(!safeStorage.isEncryptionAvailable())throw new Error("Windows 安全存储不可用，无法安全保存 API Key");
    const secret=crypto.randomBytes(32).toString("base64");await fsp.writeFile(file,safeStorage.encryptString(secret),{mode:0o600});return secret;
  }
}
const runtimeRoot=()=>{
  const packaged=path.join(process.resourcesPath,"desktop-runtime");
  if(fs.existsSync(path.join(packaged,"server.js")))return packaged;
  const local=path.join(app.getAppPath(),"desktop-runtime");
  return local;
};
function readWindowState(){try{const value=JSON.parse(fs.readFileSync(path.join(directories().settings,"window-state.json"),"utf8"));return {width:Math.max(1080,Number(value.width)||1440),height:Math.max(720,Number(value.height)||920),...(Number.isFinite(value.x)&&Number.isFinite(value.y)?{x:value.x,y:value.y}:{})}}catch{return {width:1440,height:920}}}
async function saveWindowState(){if(!mainWindow||mainWindow.isDestroyed()||mainWindow.isMinimized())return;const bounds=mainWindow.isMaximized()?mainWindow.getNormalBounds():mainWindow.getBounds();await durableJson(path.join(directories().settings,"window-state.json"),bounds)}
function waitForListeningPort(port,timeoutMs=45000){
  const deadline=Date.now()+timeoutMs;
  return new Promise((resolve,reject)=>{const poll=()=>{const socket=net.createConnection({host:"127.0.0.1",port,family:4});let settled=false;const retry=()=>{if(settled)return;settled=true;socket.destroy();if(Date.now()>deadline)return reject(new Error("本机服务端口未就绪"));setTimeout(poll,250)};socket.setTimeout(1000);socket.once("connect",()=>{if(settled)return;settled=true;socket.end();resolve(true)});socket.once("timeout",retry);socket.once("error",retry)};poll()});
}
async function startServer(){
  if(process.env.ELECTRON_DEV_URL)return process.env.ELECTRON_DEV_URL;
  if(serverProcess)return `http://127.0.0.1:${serverPort}`;
  await ensureDirectories();serverPort=await findFreePort();
  const root=runtimeRoot(),entry=path.join(root,"server.js");if(!fs.existsSync(entry))throw new Error("未找到桌面版运行文件，请先执行 build:desktop");
  const d=directories();serverProcess=spawn(process.execPath,[entry],{cwd:root,windowsHide:true,detached:process.platform!=="win32",env:{...process.env,ELECTRON_RUN_AS_NODE:"1",NODE_OPTIONS:[process.env.NODE_OPTIONS,"--max-old-space-size=1024"].filter(Boolean).join(" "),NODE_ENV:"production",HOSTNAME:"127.0.0.1",PORT:String(serverPort),AI_STUDIO_DATA_DIR:d.data,AI_STUDIO_OUTPUTS_DIR:d.outputs,AI_STUDIO_TEMP_DIR:d.temp,AI_STUDIO_LOG_DIR:d.logs,AI_STUDIO_RECOVERED:recoveredLaunch?"1":"0",PROVIDER_SETTINGS_SECRET:await getProviderSecret(),VOLCENGINE_PYTHON_BRIDGE:app.isPackaged?path.join(process.resourcesPath,"volcengine-seedream.py"):process.env.VOLCENGINE_PYTHON_BRIDGE},stdio:["ignore","pipe","pipe"]});
  const child=serverProcess;child.stdout.on("data",data=>writeLog(`[next:${child.pid}] ${data}`));child.stderr.on("data",data=>writeLog(`[next:${child.pid}:error] ${data}`));child.once("exit",code=>{void writeLog(`Next.js service exited pid=${child.pid} code=${code}`);if(serverProcess===child)serverProcess=null});
  await writeLog(`Starting Next.js service pid=${child.pid} port=${serverPort}`);
  // Electron's macOS main-process HTTP client can report a socket hang-up even
  // when the bundled Next server is already healthy. Wait for the local TCP
  // listener instead; BrowserWindow.loadURL below performs the final HTTP/page
  // verification and still surfaces a genuine application startup failure.
  await waitForListeningPort(serverPort);
  await writeLog(`Next.js service listening port=${serverPort}`);
  return `http://127.0.0.1:${serverPort}`;
}
function forceStopTree(pid){return new Promise(resolve=>{if(process.platform==="win32")execFile("taskkill",["/PID",String(pid),"/T","/F"],()=>resolve());else{try{process.kill(-pid,"SIGKILL")}catch{}resolve()}})}
async function stopServer(){const child=serverProcess;if(!child)return;serverProcess=null;const pid=child.pid,started=Date.now();child.kill("SIGTERM");const graceful=await Promise.race([new Promise(resolve=>child.once("exit",()=>resolve(true))),new Promise(resolve=>setTimeout(()=>resolve(false),4000))]);if(!graceful)await forceStopTree(pid);await writeLog(`Stopped Next.js service pid=${pid} graceful=${graceful} durationMs=${Date.now()-started}`)}
function isExternalUrl(raw){try{return ["http:","https:"].includes(new URL(raw).protocol)}catch{return false}}
function isWorkbenchPath(raw){try{const pathname=new URL(raw).pathname;return workbenchPrefixes.some(prefix=>pathname===prefix||pathname.startsWith(prefix))}catch{return false}}
const workbenchUrl=base=>`${base.replace(/\/$/,"")}/workbench`;
function validProductSku(value){return typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(value.trim())}
function productSystemWindowOptions(system,show){return {title:system.name,show,width:1440,height:960,webPreferences:{partition:system.partition,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}}}
function allowProductNavigation(system,url){try{return new URL(url).origin===system.origin}catch{return false}}
function ensureProductSystemWindow(system,show=false){
  const current=productSystemWindows.get(system.id);
  if(current&&!current.isDestroyed()){if(show)current.show();return current}
  const window=new BrowserWindow(productSystemWindowOptions(system,show));
  productSystemWindows.set(system.id,window);
  window.webContents.setWindowOpenHandler(({url})=>({action:allowProductNavigation(system,url)?"allow":"deny"}));
  window.webContents.on("will-navigate",(event,url)=>{if(!allowProductNavigation(system,url))event.preventDefault()});
  window.on("closed",()=>{productSystemWindows.delete(system.id)});
  return window;
}
function productSystemLogin(systemId){
  const system=productSystemById(systemId)||PRODUCT_SYSTEMS[0];
  const window=ensureProductSystemWindow(system,true);
  if(!window.webContents.getURL()||!allowProductNavigation(system,window.webContents.getURL()))void window.loadURL(system.loginUrl);
  return {ok:true,system:system.id,message:`已打开${system.name}登录页。登录状态只保存在本机受控浏览器会话中，工作台不会保存或读取密码。`};
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function withTimeout(promise,timeoutMs,message){
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),timeoutMs)});
  return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}
function isAbortedNavigation(error){return error?.code==="ERR_ABORTED"||error?.errno===-3||/ERR_ABORTED|\(-3\)/.test(String(error?.message||error||""))}
async function loadWorkbenchWindow(url){
  // The application page is always served by the bundled loopback server.
  // Force this one Electron session to bypass macOS proxy/PAC settings so a
  // local page cannot remain on the splash screen while the server is ready.
  await mainWindow.webContents.session.setProxy({mode:"direct"});
  try{
    await withTimeout(mainWindow.loadURL(url),4000,"工作台页面首次加载超时");
  }catch(error){
    await writeLog(`Workbench first navigation retry url=${url} error=${error?.stack||error}`);
    mainWindow.webContents.stop();
    await wait(180);
    const retryUrl=`${url}${url.includes("?")?"&":"?"}startupRetry=${Date.now()}`;
    await withTimeout(mainWindow.loadURL(retryUrl),10000,"工作台页面重试后仍未就绪");
  }
}
async function lookupProductInSystem(system,sku){
  const window=ensureProductSystemWindow(system,false);
  try{
    const searchUrl=productSearchUrl(system,sku);
    try{await window.loadURL(searchUrl)}catch(error){
      // Hash-based product portals can abort Electron's loadURL promise while
      // their own router continues to the requested product page.
      if(!isAbortedNavigation(error))throw error;
      await writeLog(`Product system continued after internal navigation system=${system.id} sku=${sku} url=${window.webContents.getURL()}`);
    }
    let formSubmitted=false;
    let sawExactRow=false;
    let loggedExactImageDiagnostics=false;
    for(let attempt=0;attempt<24;attempt++){
      await wait(500);
      const state=await window.webContents.executeJavaScript(String.raw`(() => {
        const url=location.href;
        const text=(document.body?.innerText||"").slice(0,120000);
        const inputs=[...document.querySelectorAll("input")].filter((el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0});
        const buttons=[...document.querySelectorAll("button")].filter((el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0});
        const expectedOrigins=${JSON.stringify(system.assetOrigins)};
        const expectedPrefixes=${JSON.stringify(system.resourcePrefixes)};
        const allowDirectImagePath=${JSON.stringify(system.allowDirectImagePath)};
        const normalize=(value)=>String(value||"").replace(/\s+/g,"").toUpperCase();
        const targetSku=normalize(${JSON.stringify(sku)});
        const exactSkuElement=[...document.querySelectorAll("td,[role='cell'],a,span,div")].find((el)=>{
          const r=el.getBoundingClientRect();
          return r.width>0&&r.height>0&&normalize(el.textContent)===targetSku;
        });
        const rowSelector="tr,[role='row'],.el-table__row,.ant-table-row,.vxe-body--row";
        const exactRow=exactSkuElement?.closest(rowSelector)||null;
        const rowGroup=exactRow?.closest(".el-table,.ant-table-wrapper,.vxe-table,[role='grid']")||exactRow?.closest("table")||null;
        const exactSiblings=exactRow?.parentElement?[...exactRow.parentElement.children].filter((el)=>el.matches?.(rowSelector)):[];
        const exactRowIndex=exactRow?exactSiblings.indexOf(exactRow):-1;
        const rowKey=exactRow?.getAttribute("data-row-key")||exactRow?.getAttribute("aria-rowindex")||"";
        const relatedRows=exactRow?[exactRow,...[...(rowGroup||document).querySelectorAll(rowSelector)].filter((row)=>{
          if(row===exactRow)return false;
          const candidateKey=row.getAttribute("data-row-key")||row.getAttribute("aria-rowindex")||"";
          if(rowKey&&candidateKey===rowKey)return true;
          if(exactRowIndex<0||!row.parentElement)return false;
          const siblings=[...row.parentElement.children].filter((el)=>el.matches?.(rowSelector));
          return siblings.indexOf(row)===exactRowIndex;
        })]:[];
        const imageElements=[...new Set(relatedRows.flatMap((row)=>[...row.querySelectorAll("img,a,[style*='background-image']")]))];
        const rawCandidates=imageElements.flatMap((el)=>{
          const srcset=String(el.getAttribute?.("srcset")||"").split(",").map((part)=>part.trim().split(/\s+/)[0]);
          const background=String(getComputedStyle(el).backgroundImage||"").match(/url\(["']?([^"')]+)["']?\)/)?.[1]||"";
          return [
            el.currentSrc,
            el.src,
            el.href,
            el.getAttribute?.("data-src"),
            el.getAttribute?.("data-original"),
            el.getAttribute?.("data-original-src"),
            el.getAttribute?.("data-url"),
            el.getAttribute?.("data-image"),
            el.getAttribute?.("alt"),
            background,
            ...srcset,
          ];
        });
        const urls=rawCandidates.map((raw)=>{
          if(!raw||String(raw).startsWith("data:")||String(raw).startsWith("blob:"))return "";
          try{return new URL(String(raw),location.origin).toString()}catch{return ""}
        }).filter((value)=>{try{
          const parsed=new URL(value);
          const isImage=/\.(?:avif|gif|jpe?g|png|webp)$/i.test(parsed.pathname);
          const allowedPath=expectedPrefixes.some((prefix)=>parsed.pathname.startsWith(prefix))||allowDirectImagePath;
          return expectedOrigins.includes(parsed.origin)&&isImage&&allowedPath;
        }catch{return false}});
        const candidatePreview=[...new Set(rawCandidates.map((raw)=>String(raw||"")).filter((raw)=>raw&&!raw.startsWith("data:")&&raw.length<500))].slice(0,16);
        const candidateFiles=new Set(candidatePreview.map((raw)=>{try{return new URL(raw,location.origin).pathname.split("/").pop()||""}catch{return ""}}).filter(Boolean));
        const resourceMatches=[...new Set(performance.getEntriesByType("resource").map((entry)=>entry.name).filter((name)=>{try{
          const parsed=new URL(name);
          return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(parsed.pathname)&&candidateFiles.has(parsed.pathname.split("/").pop()||"");
        }catch{return false}}))].slice(0,12);
        return {url,text,hasSearchForm:inputs.length>0,exactMatch:Boolean(exactRow),urls,candidatePreview,resourceMatches};
      })()`);
      if(state.url.includes("/login")||/登录密码|请输入密码|忘记密码|手机号登录/.test(state.text))return {ok:false,system:system.id,systemName:system.name,code:"needs_login",error:`${system.name}尚未登录`};
      const urls=[...new Set(state.urls)]
        .map((value)=>value.replace(/\/thumbnails\//,"/"))
        .sort((left,right)=>Number(right.includes("/files/x/"))-Number(left.includes("/files/x/")));
      if(state.exactMatch){
        sawExactRow=true;
        if(!urls.length&&!loggedExactImageDiagnostics){loggedExactImageDiagnostics=true;await writeLog(`Product system exact row image diagnostics system=${system.id} sku=${sku} candidates=${JSON.stringify(state.candidatePreview||[])} resources=${JSON.stringify(state.resourceMatches||[])}`)}
      }
      if(state.exactMatch&&urls.length)return {ok:true,exactMatch:true,sku,urls:[urls[0]],source:system.id,sourceName:system.name};
      if(!formSubmitted&&state.hasSearchForm&&attempt>=1){
        formSubmitted=await window.webContents.executeJavaScript(String.raw`(() => {
          const inputs=[...document.querySelectorAll("input")].filter((el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0});
          const buttons=[...document.querySelectorAll("button")].filter((el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0});
          const input=inputs.find((el)=>/货号|商品|编号|搜索|查询/i.test((el.placeholder||"")+" "+(el.getAttribute("aria-label")||"")))||inputs[0];
          if(!input)return false;
          const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
          if(setter){setter.call(input,${JSON.stringify(sku)});input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}))}
          const button=buttons.find((el)=>/搜索|查询|筛选/i.test(el.innerText||""));
          if(button)button.click();
          else input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true}));
          return true;
        })()`);
        if(formSubmitted)await wait(900);
      }
    }
    if(sawExactRow){
      await writeLog(`Product system exact row found without readable image system=${system.id} sku=${sku}`);
      return {ok:false,exactMatch:true,system:system.id,systemName:system.name,code:"image_unreadable",error:`${system.name}已找到货号 ${sku}，但暂未读取到该行商品图`};
    }
    return {ok:false,system:system.id,systemName:system.name,code:"not_found",error:`${system.name}没有找到货号 ${sku}`};
  }catch(error){
    await writeLog(`Product system lookup failed system=${system.id} sku=${sku} error=${error?.stack||error}`);
    return {ok:false,system:system.id,systemName:system.name,code:"connection_failed",error:`无法连接${system.name}`};
  }
}
async function productSystemLookup(rawSku){
  const sku=String(rawSku||"").trim();
  if(!validProductSku(sku))return {ok:false,code:"invalid_sku",error:"货号只允许字母、数字、点、下划线和短横线，长度 2–80 位"};
  const attempts=[];
  for(const system of PRODUCT_SYSTEMS){
    const result=await lookupProductInSystem(system,sku);
    attempts.push({system:system.id,systemName:system.name,code:result.code||"success"});
    if(result.ok)return {...result,attempts};
  }
  const loginSystems=attempts.filter(item=>item.code==="needs_login").map(item=>item.systemName);
  const unreadableSystems=attempts.filter(item=>item.code==="image_unreadable").map(item=>item.systemName);
  const connectionSystems=attempts.filter(item=>item.code==="connection_failed").map(item=>item.systemName);
  const code=loginSystems.length?"needs_login":unreadableSystems.length?"image_unreadable":connectionSystems.length?"connection_failed":"not_found";
  const error=loginSystems.length
    ?`请先登录：${loginSystems.join("、")}。登录一次后工作台会保持各自的本机会话。`
    :unreadableSystems.length
      ?`已在${unreadableSystems.join("、")}找到货号 ${sku}，但商品图暂时无法读取，请重试或重新登录该系统。`
      :connectionSystems.length
        ?`${connectionSystems.join("、")}页面加载未完成，尚不能判定货号 ${sku} 不存在，请稍后重试。`
      :`两个商品系统都没有找到货号 ${sku} 的高清商品图。`;
  return {ok:false,sku,code,attempts,error};
}
async function createWindow(){
  mainWindow=new BrowserWindow({title:"AI服装工作台",...readWindowState(),minWidth:1080,minHeight:720,show:false,backgroundColor:"#f6f7fb",webPreferences:{preload:path.join(__dirname,"preload.cjs"),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  mainWindow.on("close",()=>{void saveWindowState()});mainWindow.on("session-end",()=>{void stopServer()});
  mainWindow.on("closed",()=>{mainWindow=null});
  mainWindow.webContents.on("did-fail-load",(event,errorCode,errorDescription,validatedURL,isMainFrame)=>{if(isMainFrame)void writeLog(`Workbench navigation failed code=${errorCode} description=${errorDescription} url=${validatedURL}`)});
  mainWindow.webContents.on("did-finish-load",()=>{void writeLog(`Workbench navigation finished url=${mainWindow?.webContents.getURL()||"unknown"}`)});
  mainWindow.webContents.on("context-menu",(event,params)=>{
    const actions=[];
    if(params.isEditable){
      actions.push(
        {role:"undo",label:"撤销",enabled:params.editFlags.canUndo},
        {role:"redo",label:"重做",enabled:params.editFlags.canRedo},
        {type:"separator"},
        {role:"cut",label:"剪切",enabled:params.editFlags.canCut},
        {role:"copy",label:"复制",enabled:params.editFlags.canCopy},
        {role:"paste",label:"粘贴",enabled:params.editFlags.canPaste},
        {role:"selectAll",label:"全选"},
      );
    }else if(params.selectionText){
      actions.push({role:"copy",label:"复制"},{role:"selectAll",label:"全选"});
    }
    if(actions.length)Menu.buildFromTemplate(actions).popup({window:mainWindow});
  });
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(isExternalUrl(url))void shell.openExternal(url);return {action:"deny"}});
  mainWindow.webContents.on("will-navigate",(event,url)=>{const local=serverPort&&url.startsWith(`http://127.0.0.1:${serverPort}`),dev=process.env.ELECTRON_DEV_URL&&url.startsWith(process.env.ELECTRON_DEV_URL);if((local||dev)&&!isWorkbenchPath(url)){event.preventDefault();void mainWindow.loadURL(workbenchUrl(new URL(url).origin));return}if(!local&&!dev){event.preventDefault();if(isExternalUrl(url))void shell.openExternal(url)}});
  const loadingPage=`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset=utf-8><style>body{font:16px system-ui;padding:48px;background:#f6f7fb;color:#222}main{max-width:720px;margin:12vh auto;background:white;padding:36px;border-radius:20px;box-shadow:0 12px 36px #20204014}h1{margin:0 0 12px;font-size:28px}p{color:#62677a}</style><main><h1>AI服装工作台</h1><p>正在启动本机服务，请稍候…</p></main>`)};`;
  try{
    await mainWindow.loadURL(loadingPage);
    mainWindow.show();
    await loadWorkbenchWindow(workbenchUrl(await startServer()));
  }catch(error){
    await writeLog(`Startup failed: ${error?.stack||error}`);
    const message=redact(error instanceof Error?error.message:String(error)).replace(/[<>&]/g,char=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[char]));
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset=utf-8><style>body{font:16px system-ui;padding:48px;background:#f6f7fb;color:#222}main{max-width:720px;margin:12vh auto;background:white;padding:32px;border-radius:16px}h1{margin-top:0}</style><main><h1>工作台启动失败</h1><p>${message}</p><p>请重启软件，或在“帮助 → 日志目录”查看原因。</p></main>`)}`);
    mainWindow.show();
  }
}
function installMenu(){Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:"文件",submenu:[{label:"打开输出文件夹",click:()=>shell.openPath(directories().pictures)},{label:"打开数据文件夹",click:()=>shell.openPath(directories().base)},{type:"separator"},{role:"quit",label:"退出"}]},
  {label:"编辑",submenu:[
    {role:"undo",label:"撤销"},{role:"redo",label:"重做"},{type:"separator"},
    {role:"cut",label:"剪切"},{role:"copy",label:"复制"},{role:"paste",label:"粘贴"},{role:"pasteAndMatchStyle",label:"粘贴并匹配样式"},{role:"delete",label:"删除"},{type:"separator"},{role:"selectAll",label:"全选"},
  ]},
  {label:"视图",submenu:[{label:"安全刷新数据",accelerator:"CmdOrCtrl+R",click:()=>mainWindow?.webContents.executeJavaScript("window.dispatchEvent(new Event('workbench:refresh'))")},{role:"zoomIn",label:"放大"},{role:"zoomOut",label:"缩小"},{role:"resetZoom",label:"重置缩"},...(app.isPackaged?[]:[{role:"toggleDevTools",label:"开发者工具"}])]},
  {label:"帮助",submenu:[{label:`当前版本 ${app.getVersion()}`,enabled:false},{label:"日志目录",click:()=>shell.openPath(directories().logs)}]},
]))}
function isTrustedRenderer(event){
  if(!mainWindow||event.sender!==mainWindow.webContents)return false;
  try{const url=new URL(event.sender.getURL());return url.hostname==="127.0.0.1"||url.hostname==="localhost"}
  catch{return false}
}
ipcMain.handle("desktop:get-app-info",()=>({version:app.getVersion(),platform:process.platform}));ipcMain.handle("desktop:open-output-folder",()=>shell.openPath(directories().pictures));ipcMain.handle("desktop:open-data-folder",()=>shell.openPath(directories().base));ipcMain.handle("desktop:open-log-folder",()=>shell.openPath(directories().logs));
ipcMain.handle("desktop:product-system-login",(event,systemId)=>{if(!isTrustedRenderer(event))throw new Error("未授权的桌面调用");return productSystemLogin(systemId)});
ipcMain.handle("desktop:product-system-lookup",async(event,sku)=>{if(!isTrustedRenderer(event))throw new Error("未授权的桌面调用");return productSystemLookup(sku)});
ipcMain.handle("desktop:copy-image",(_,value)=>{try{const bytes=value instanceof ArrayBuffer?Buffer.from(value):Buffer.from(value?.buffer||value);if(!bytes.length||bytes.length>60*1024*1024)throw new Error("图片文件过大，无法复制");const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw new Error("图片格式无法复制");clipboard.writeImage(image);return {ok:true}}catch(error){return {ok:false,error:error instanceof Error?error.message:"复制图片失败"}}});
app.on("second-instance",()=>{if(mainWindow&&!mainWindow.isDestroyed()){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus()}else void createWindow()});
app.whenReady().then(async()=>{await ensureDirectories();await markDesktopSession("running");installMenu();await createWindow()}).catch(error=>{void writeLog(error?.stack||error);app.quit()});
app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow()});app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit()});
app.on("before-quit",event=>{if(quitting)return;quitting=true;event.preventDefault();for(const window of productSystemWindows.values()){try{window.destroy()}catch{}}productSystemWindows.clear();void stopServer().then(()=>markDesktopSession("clean")).finally(()=>app.exit(0))});
process.on("uncaughtException",error=>{void writeLog(`uncaughtException ${error.stack||error}`)});process.on("unhandledRejection",error=>{void writeLog(`unhandledRejection ${error}`)});
