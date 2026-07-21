"use client";
import { useEffect, useState } from "react";

export default function ImagePreviewDialog({ images, index, onClose }: { images: string[]; index: number; onClose: () => void }) {
  const [active, setActive] = useState(index); const [zoom, setZoom] = useState(1);
  useEffect(() => { const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", fn); return () => window.removeEventListener("keydown", fn); }, [onClose]);
  if (!images[active]) return null;
  return <div className="dialog-backdrop" onClick={onClose} role="dialog" aria-modal="true">
    <button className="dialog-close" onClick={onClose}>×</button>
    <div className="image-dialog" onClick={(e) => e.stopPropagation()} style={{ "--zoom": zoom } as React.CSSProperties}>
      <img src={images[active]} alt="大图预览" />
      <div className="dialog-tools"><button onClick={() => setZoom((z) => Math.max(.5, z - .25))}>− 缩小</button><button onClick={() => setZoom(1)}>适应窗口</button><button onClick={() => setZoom((z) => Math.min(3, z + .25))}>＋ 放大</button>{images.length > 1 && <><button onClick={() => { setActive((active - 1 + images.length) % images.length); setZoom(1); }}>上一张</button><button onClick={() => { setActive((active + 1) % images.length); setZoom(1); }}>下一张</button></>}<a href={images[active]} download>下载</a></div>
    </div>
  </div>;
}
