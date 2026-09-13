import sharp from "sharp";

type ImageQueueRuntime=typeof globalThis&{__workbenchImageQueue?:Promise<void>};
const imageQueueRuntime=globalThis as ImageQueueRuntime;

/** 大图读取与缩放依次执行，避免缩略图并发请求先把多张原图同时读进内存。 */
export async function serializeImageWork<T>(work:()=>Promise<T>):Promise<T>{
  const previous=imageQueueRuntime.__workbenchImageQueue||Promise.resolve();
  let release!:()=>void;
  imageQueueRuntime.__workbenchImageQueue=new Promise<void>(resolve=>{release=resolve});
  await previous.catch(()=>{});
  try{return await work()}finally{release()}
}

// 图片处理内存保护：Sharp 默认允许解码约 2.68 亿像素（约 1GB 内存/张），
// 叠加并发后会把整台 Windows 机器内存耗尽导致整机卡死、黑屏关机。
// 这里统一限制长边尺寸和像素上限，并对全局 libvips 做内存约束。

// 输入图片长边上限：上传/预处理统一降采样到此以内，覆盖手机 48MP/108MP 原图。
export const MAX_INPUT_DIMENSION = 2048;

// 硬像素上限（安全网）：超过此值 sharp 直接拒绝，绝不触发全图解码。
// 128MP 已覆盖绝大多数手机/相机原图，同时把单张解码峰值限制在约 512MB 以内。
export const MAX_INPUT_PIXELS = 64_000_000;

// 缩略图等服务端缩放用途的像素上限，比输入更严格。
export const MAX_THUMBNAIL_PIXELS = 24_000_000;

// 在服务启动时调用一次：关闭 libvips 输入缓存、限制并发线程，降低峰值内存。
export function configureSharpMemory() {
  try {
    sharp.cache(false);
    // 2 个 libvips 工作线程在 Windows 上仍保持较低峰值内存，同时可让
    // 缩放、取色和本地 QC 利用多核；可用环境变量回退为 1。
    const configured = Number(process.env.AI_STUDIO_SHARP_CONCURRENCY || 2);
    sharp.concurrency(
      Number.isFinite(configured)
        ? Math.max(1, Math.min(4, Math.round(configured)))
        : 2,
    );
  } catch {
    // sharp 初始化失败不影响后续流程，图片处理会各自带上 limitInputPixels。
  }
}

// 安全缩放：先按长边缩放（JPEG/WebP 走 shrink-on-load，避免全图解码），
// 再按 EXIF 方向旋转、去透明底并转 JPEG。所有入参都受像素上限保护。
export async function resizeToJpeg(
  buffer: Buffer,
  maxDim = MAX_INPUT_DIMENSION,
  quality = 92,
  maxPixels = MAX_INPUT_PIXELS,
): Promise<Buffer> {
  return sharp(buffer, { failOn: "error", animated: false, limitInputPixels: maxPixels })
    .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

// 读取 EXIF 自动旋转后的实际宽高（orientation 5~8 为 90°/270°，宽高互换）。
export async function rotatedDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  if (!meta.width || !meta.height) throw new Error("图片尺寸无效");
  const swap = (meta.orientation || 1) >= 5;
  return { width: swap ? meta.height : meta.width, height: swap ? meta.width : meta.height };
}

// 旋转 + 裁剪：在单条管线内完成，避免先全图解码再重新编码造成的大内存峰值。
export async function rotateAndExtract(
  buffer: Buffer,
  box: { left: number; top: number; width: number; height: number },
  quality = 95,
): Promise<Buffer> {
  return sharp(buffer, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

/** 列表缩略图只等比例缩小并压缩画质，绝不裁剪原图。 */
export async function createThumbnail(buffer:Buffer,width:number,quality=76):Promise<Buffer>{
  return sharp(buffer,{failOn:"error",animated:false,limitInputPixels:MAX_THUMBNAIL_PIXELS})
    .rotate()
    .resize({width:Math.max(120,Math.min(960,Math.round(width))),height:1280,fit:"inside",withoutEnlargement:true})
    .jpeg({quality:Math.max(60,Math.min(90,quality)),mozjpeg:true})
    .toBuffer();
}
