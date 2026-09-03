import {originalImageUrl} from "./image-url";

type DesktopClipboard={copyImage?:(value:ArrayBuffer)=>Promise<{ok?:boolean;error?:string}>};

function desktopClipboard(){
  return (window as typeof window&{desktop?:DesktopClipboard}).desktop;
}

async function pngBlob(blob:Blob){
  if(blob.type==="image/png")return blob;
  const bitmap=await createImageBitmap(blob);
  try{
    const canvas=document.createElement("canvas");
    canvas.width=bitmap.width;
    canvas.height=bitmap.height;
    const context=canvas.getContext("2d");
    if(!context)throw new Error("无法读取图片画面");
    context.drawImage(bitmap,0,0);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("无法转换图片格式")),"image/png"));
  }finally{bitmap.close()}
}

/** 把图片本身写入系统剪贴板。桌面版优先走 Electron，浏览器使用标准 Clipboard API。 */
export async function copyImageToClipboard(url:string){
  if(!url)throw new Error("没有可复制的图片");
  const response=await fetch(originalImageUrl(url),{cache:"no-store"});
  if(!response.ok)throw new Error("读取原始图片失败");
  const blob=await response.blob();
  if(!blob.type.startsWith("image/"))throw new Error("当前内容不是有效图片");
  const desktop=desktopClipboard();
  if(desktop?.copyImage){
    const result=await desktop.copyImage(await blob.arrayBuffer());
    if(result.ok)return;
    throw new Error(result.error||"Windows 剪贴板无法接收这张图片");
  }
  if(!navigator.clipboard?.write||typeof ClipboardItem==="undefined")throw new Error("当前环境不支持复制图片，请使用下载功能");
  const png=await pngBlob(blob);
  await navigator.clipboard.write([new ClipboardItem({"image/png":png})]);
}
