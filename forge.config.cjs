const packageRoot=process.cwd().replace(/\\/g,"/");
const allowedApplicationRoots=new Set(["electron","package.json"]);
function ignoreProjectArtifact(filePath){
  const normalized=String(filePath).replace(/\\/g,"/");
  const relative=normalized.startsWith(`${packageRoot}/`)
    ? normalized.slice(packageRoot.length+1)
    : normalized.replace(/^\/+/,"");
  if(!relative)return false;
  const [topLevel]=relative.split("/");
  return !allowedApplicationRoots.has(topLevel);
}

module.exports={
  packagerConfig:{
    asar:true,
    appBundleId:"com.ai-fashion-workbench.desktop",
    executableName:"ai-fashion-workbench",
    icon:"build/icons/icon",
    extendInfo:{CFBundleDisplayName:"AI服装工作台",CFBundleName:"AI服装工作台"},
    win32metadata:{CompanyName:"AI Fashion Workbench",FileDescription:"AI服装图片生产工作台",InternalName:"AI Fashion Workbench",OriginalFilename:"ai-fashion-workbench.exe",ProductName:"AI服装工作台"},
    extraResource:["desktop-runtime","scripts/volcengine-seedream.py"],
    ignore:ignoreProjectArtifact,
  },
  rebuildConfig:{},
  makers:[{name:"@electron-forge/maker-squirrel",config:{name:"ai_fashion_workbench",authors:"AI Fashion Workbench",description:"AI服装图片生产工作台",setupExe:"AI服装工作台 Setup.exe",noMsi:true}},{name:"@electron-forge/maker-dmg",config:{name:"AI服装工作台",format:"ULFO"},platforms:["darwin"]}],
  plugins:[{name:"@electron-forge/plugin-auto-unpack-natives",config:{}}],
};
