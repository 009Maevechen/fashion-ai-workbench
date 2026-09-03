/* eslint-disable @typescript-eslint/no-require-imports */
const {app,BrowserWindow,Menu,clipboard,ipcMain,nativeImage,safeStorage,shell}=require("electron");
const {spawn,execFile}=require("node:child_process");
const crypto=require("node:crypto");
const fs=require("node:fs");
const fsp=require("node:fs/promises");
const http=require("node:http");
const net=require("node:net");
const path=require("node:path");

app.setName("AI服装工作台");
if(process.platform==="win32"){
  // Windows 显卡驱动在同时解码大量高分辨率图片时可能拖垮整机。
  // 工作台不是 3D 应用，使用软件绘制更稳，缩略图仍由服务端生成。
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("js-flags","--max-old-space-size=768");
  app.commandLine.appendSwitch("disk-cache-size","134217728");
}
if(!app.requestSingleInstanceLock())app.quit();
let mainWindow=null,serverProcess=null,serverPort=null,quitting=false;
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
const runtimeRoot=()=>app.isPackaged?path.join(process.resourcesPath,"desktop-runtime"):path.join(app.getAppPath(),"desktop-runtime");
function readWindowState(){try{const value=JSON.parse(fs.readFileSync(path.join(directories().settings,"window-state.json"),"utf8"));return {width:Math.max(1080,Number(value.width)||1440),height:Math.max(720,Number(value.height)||920),...(Number.isFinite(value.x)&&Number.isFinite(value.y)?{x:value.x,y:value.y}:{})}}catch{return {width:1440,height:920}}}
async function saveWindowState(){if(!mainWindow||mainWindow.isDestroyed()||mainWindow.isMinimized())return;const bounds=mainWindow.isMaximized()?mainWindow.getNormalBounds():mainWindow.getBounds();await durableJson(path.join(directories().settings,"window-state.json"),bounds)}
function waitForHealth(port,timeoutMs=45000){
  const deadline=Date.now()+timeoutMs;
  return new Promise((resolve,reject)=>{const poll=()=>{const request=http.get({hostname:"127.0.0.1",port,path:"/api/health",timeout:1500},response=>{let body="";response.on("data",chunk=>body+=chunk);response.on("end",()=>{try{const parsed=JSON.parse(body);if(response.statusCode===200&&parsed.ok)return resolve(parsed)}catch{}retry()})});request.on("timeout",()=>request.destroy());request.on("error",retry);function retry(){if(Date.now()>deadline)return reject(new Error("Next.js 服务启动超时"));setTimeout(poll,350)}};poll()});
}
async function startServer(){
  if(process.env.ELECTRON_DEV_URL)return process.env.ELECTRON_DEV_URL;
  if(serverProcess)return `http://127.0.0.1:${serverPort}`;
  await ensureDirectories();serverPort=await findFreePort();
  const root=runtimeRoot(),entry=path.join(root,"server.js");if(!fs.existsSync(entry))throw new Error("未找到桌面版运行文件，请先执行 build:desktop");
  const d=directories();serverProcess=spawn(process.execPath,[entry],{cwd:root,windowsHide:true,detached:process.platform!=="win32",env:{...process.env,ELECTRON_RUN_AS_NODE:"1",NODE_OPTIONS:[process.env.NODE_OPTIONS,"--max-old-space-size=1024"].filter(Boolean).join(" "),NODE_ENV:"production",HOSTNAME:"127.0.0.1",PORT:String(serverPort),AI_STUDIO_DATA_DIR:d.data,AI_STUDIO_OUTPUTS_DIR:d.outputs,AI_STUDIO_TEMP_DIR:d.temp,AI_STUDIO_LOG_DIR:d.logs,AI_STUDIO_RECOVERED:recoveredLaunch?"1":"0",PROVIDER_SETTINGS_SECRET:await getProviderSecret()},stdio:["ignore","pipe","pipe"]});
  const child=serverProcess;child.stdout.on("data",data=>writeLog(`[next:${child.pid}] ${data}`));child.stderr.on("data",data=>writeLog(`[next:${child.pid}:error] ${data}`));child.once("exit",code=>{void writeLog(`Next.js service exited pid=${child.pid} code=${code}`);if(serverProcess===child)serverProcess=null});
  await writeLog(`Starting Next.js service pid=${child.pid} port=${serverPort}`);await waitForHealth(serverPort);return `http://127.0.0.1:${serverPort}`;
}
function forceStopTree(pid){return new Promise(resolve=>{if(process.platform==="win32")execFile("taskkill",["/PID",String(pid),"/T","/F"],()=>resolve());else{try{process.kill(-pid,"SIGKILL")}catch{}resolve()}})}
async function stopServer(){const child=serverProcess;if(!child)return;serverProcess=null;const pid=child.pid,started=Date.now();child.kill("SIGTERM");const graceful=await Promise.race([new Promise(resolve=>child.once("exit",()=>resolve(true))),new Promise(resolve=>setTimeout(()=>resolve(false),4000))]);if(!graceful)await forceStopTree(pid);await writeLog(`Stopped Next.js service pid=${pid} graceful=${graceful} durationMs=${Date.now()-started}`)}
function isExternalUrl(raw){try{return ["http:","https:"].includes(new URL(raw).protocol)}catch{return false}}
function isWorkbenchPath(raw){try{const pathname=new URL(raw).pathname;return workbenchPrefixes.some(prefix=>pathname===prefix||pathname.startsWith(prefix))}catch{return false}}
const workbenchUrl=base=>`${base.replace(/\/$/,"")}/workbench`;
async function createWindow(){
  mainWindow=new BrowserWindow({title:"AI服装工作台",...readWindowState(),minWidth:1080,minHeight:720,show:false,backgroundColor:"#f6f7fb",webPreferences:{preload:path.join(__dirname,"preload.cjs"),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  mainWindow.on("close",()=>{void saveWindowState()});mainWindow.on("session-end",()=>{void stopServer()});
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(isExternalUrl(url))void shell.openExternal(url);return {action:"deny"}});
  mainWindow.webContents.on("will-navigate",(event,url)=>{const local=serverPort&&url.startsWith(`http://127.0.0.1:${serverPort}`),dev=process.env.ELECTRON_DEV_URL&&url.startsWith(process.env.ELECTRON_DEV_URL);if((local||dev)&&!isWorkbenchPath(url)){event.preventDefault();void mainWindow.loadURL(workbenchUrl(new URL(url).origin));return}if(!local&&!dev){event.preventDefault();if(isExternalUrl(url))void shell.openExternal(url)}});
  try{await mainWindow.loadURL(workbenchUrl(await startServer()))}catch(error){await writeLog(`Startup failed: ${error?.stack||error}`);const message=redact(error instanceof Error?error.message:String(error)).replace(/[<>&]/g,char=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[char]));await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset=utf-8><style>body{font:16px system-ui;padding:48px;background:#f6f7fb;color:#222}main{max-width:720px;margin:auto;background:white;padding:32px;border-radius:16px}</style><main><h1>工作台启动失败</h1><p>${message}</p><p>请重启软件，或在“帮助 → 日志目录”查看原因。</p></main>`)}`)}mainWindow.show();
}
function installMenu(){Menu.setApplicationMenu(Menu.buildFromTemplate([{label:"文件",submenu:[{label:"打开输出文件夹",click:()=>shell.openPath(directories().pictures)},{label:"打开数据文件夹",click:()=>shell.openPath(directories().base)},{type:"separator"},{role:"quit",label:"退出"}]},{label:"视图",submenu:[{label:"安全刷新数据",accelerator:"CmdOrCtrl+R",click:()=>mainWindow?.webContents.executeJavaScript("window.dispatchEvent(new Event('workbench:refresh'))")},{role:"zoomIn",label:"放大"},{role:"zoomOut",label:"缩小"},{role:"resetZoom",label:"重置缩"},...(app.isPackaged?[]:[{role:"toggleDevTools",label:"开发者工具"}])]},{label:"帮助",submenu:[{label:`当前版本 ${app.getVersion()}`,enabled:false},{label:"日志目录",click:()=>shell.openPath(directories().logs)}]}]))}
ipcMain.handle("desktop:get-app-info",()=>({version:app.getVersion(),platform:process.platform}));ipcMain.handle("desktop:open-output-folder",()=>shell.openPath(directories().pictures));ipcMain.handle("desktop:open-data-folder",()=>shell.openPath(directories().base));ipcMain.handle("desktop:open-log-folder",()=>shell.openPath(directories().logs));
ipcMain.handle("desktop:copy-image",(_,value)=>{try{const bytes=value instanceof ArrayBuffer?Buffer.from(value):Buffer.from(value?.buffer||value);if(!bytes.length||bytes.length>60*1024*1024)throw new Error("图片文件过大，无法复制");const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw new Error("图片格式无法复制");clipboard.writeImage(image);return {ok:true}}catch(error){return {ok:false,error:error instanceof Error?error.message:"复制图片失败"}}});
app.on("second-instance",()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus()}});
app.whenReady().then(async()=>{await ensureDirectories();await markDesktopSession("running");installMenu();await createWindow()}).catch(error=>{void writeLog(error?.stack||error);app.quit()});
app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow()});app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit()});
app.on("before-quit",event=>{if(quitting)return;quitting=true;event.preventDefault();void stopServer().then(()=>markDesktopSession("clean")).finally(()=>app.exit(0))});
process.on("uncaughtException",error=>{void writeLog(`uncaughtException ${error.stack||error}`)});process.on("unhandledRejection",error=>{void writeLog(`unhandledRejection ${error}`)});
