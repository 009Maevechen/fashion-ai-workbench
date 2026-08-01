module.exports={
  packagerConfig:{
    asar:true,
    executableName:"ai-fashion-workbench",
    extraResource:["desktop-runtime"],
    ignore:[/^\/(?:\.git|\.next|data|outputs|uploads|logs|temp|desktop-runtime)(?:\/|$)/,/^\/(?:\.env|\.env\..*)$/],
  },
  rebuildConfig:{},
  makers:[{name:"@electron-forge/maker-squirrel",config:{name:"ai_fashion_workbench",authors:"AI Fashion Workbench",description:"AI服装图片生产工作台",setupExe:"AI服装工作台 Setup.exe",noMsi:true}}],
  plugins:[{name:"@electron-forge/plugin-auto-unpack-natives",config:{}}],
};
