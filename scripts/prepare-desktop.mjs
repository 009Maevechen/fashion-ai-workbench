import fs from "node:fs/promises";
import path from "node:path";

const root=process.cwd(),source=path.join(root,".next","standalone"),target=path.join(root,"desktop-runtime");
await fs.access(path.join(source,"server.js"));
await fs.rm(target,{recursive:true,force:true});
await fs.cp(source,target,{recursive:true});
await fs.mkdir(path.join(target,".next"),{recursive:true});
await fs.cp(path.join(root,".next","static"),path.join(target,".next","static"),{recursive:true});
try{await fs.cp(path.join(root,"public"),path.join(target,"public"),{recursive:true})}catch(error){if(error?.code!=="ENOENT")throw error}
console.log(`Desktop runtime prepared at ${target}`);
