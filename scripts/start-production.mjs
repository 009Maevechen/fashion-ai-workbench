import {fileURLToPath} from "node:url";
import path from "node:path";

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
process.chdir(projectRoot);
process.argv=[process.argv[0],"next","start","-p","3001"];
await import("../node_modules/next/dist/bin/next");
