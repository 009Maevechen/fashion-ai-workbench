declare module "heic-convert"{
  type ConvertOptions={buffer:Buffer;format:"JPEG"|"PNG";quality?:number};
  type Convert=(options:ConvertOptions)=>Promise<ArrayBuffer|Uint8Array|Buffer>;
  const convert:Convert;
  export default convert;
}
