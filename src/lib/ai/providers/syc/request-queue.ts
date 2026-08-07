type SycRequestQueueGlobal=typeof globalThis&{__sycRequestTail?:Promise<void>};
const state=globalThis as SycRequestQueueGlobal;

/** SYC 的图片编辑网关对并发大文件请求不稳定；只串行化真实网络调用，不阻塞其他提供商。 */
export async function serializeSycRequest<T>(request:()=>Promise<T>):Promise<T>{
  const previous=state.__sycRequestTail||Promise.resolve();
  let release!:()=>void;
  state.__sycRequestTail=new Promise<void>(resolve=>{release=resolve});
  await previous.catch(()=>{});
  try{return await request()}finally{release()}
}
