module.exports={
  packagerConfig:{
    asar:true,
    executableName:"ai-fashion-workbench",
    icon:"build/icons/icon",
    win32metadata:{CompanyName:"AI Fashion Workbench",FileDescription:"AI服装图片生产工作台",InternalName:"AI Fashion Workbench",OriginalFilename:"ai-fashion-workbench.exe",ProductName:"AI服装工作台"},
    extraResource:["desktop-runtime","scripts/volcengine-seedream.py"],
    ignore:[/^\/(?:\.git|\.next|data|outputs|uploads|logs|temp|desktop-runtime|build)(?:\/|$)/,/^\/(?:\.env|\.env\..*)$/],
  },
  rebuildConfig:{},
  makers:[{name:"@electron-forge/maker-squirrel",config:{name:"ai_fashion_workbench",authors:"AI Fashion Workbench",description:"AI服装图片生产工作台",setupExe:"AI服装工作台 Setup.exe",noMsi:true}},{name:"@electron-forge/maker-dmg",config:{name:"AI服装工作台",format:"ULFO"},platforms:["darwin"]}],
  plugins:[{name:"@electron-forge/plugin-auto-unpack-natives",config:{}}],
};
