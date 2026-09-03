"use client";
import {useEffect,useRef,useState} from "react";

export type InpaintMask = { dataUrl: string; hasMask: boolean };

/**
 * 局部重绘编辑器：在图片上用手绘涂抹出需要修改的区域，输出蒙版 PNG。
 * 蒙版中白色（不透明）为选中区域，其余为透明。
 */
export default function InpaintEditor({
  src,
  initialMask,
  onChange,
}: {
  src: string;
  initialMask?: string | null;
  onChange: (mask: InpaintMask) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [brushSize, setBrushSize] = useState(28);
  const [mode, setMode] = useState<"brush" | "eraser">("brush");
  const [scale, setScale] = useState(1);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const hasMask = useRef(false);

  function emit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onChange({ dataUrl, hasMask: hasMask.current });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (initialMask) {
        const maskImage = new Image();
        maskImage.onload = () => {
          ctx.drawImage(maskImage, 0, 0);
          hasMask.current = true;
          emit();
        };
        maskImage.src = initialMask;
      } else {
        hasMask.current = false;
        onChange({dataUrl:"",hasMask:false});
      }
    };
    image.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function canvasPoint(e: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function stroke(from: { x: number; y: number }, to: { x: number; y: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (mode === "brush") {
      ctx.globalAlpha = 0.68;
      ctx.strokeStyle = "#e23c3c";
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = canvasPoint(e);
    lastPoint.current = p;
    stroke(p, p);
    if(mode==="brush")hasMask.current=true;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    const p = canvasPoint(e);
    if (lastPoint.current) stroke(lastPoint.current, p);
    lastPoint.current = p;
  }
  function onPointerUp() {
    drawing.current = false;
    lastPoint.current = null;
    emit();
  }

  function clearMask() {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasMask.current = false;
    onChange({dataUrl:"",hasMask:false});
  }

  return (
    <div className="inpaint-editor">
      <div className="inpaint-toolbar">
        <button type="button" className={mode === "brush" ? "active" : ""} onClick={() => setMode("brush")}>🖌 画笔</button>
        <button type="button" className={mode === "eraser" ? "active" : ""} onClick={() => setMode("eraser")}>⌫ 橡皮擦</button>
        <label className="inpaint-brush-size">画笔大小<input type="range" min={6} max={120} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} /><span>{brushSize}px</span></label>
        <button type="button" onClick={clearMask}>清空选区</button>
        <label className="inpaint-zoom">缩放<input type="range" min={0.5} max={2.5} step={0.1} value={scale} onChange={(e) => setScale(Number(e.target.value))} /><span>{Math.round(scale * 100)}%</span></label>
      </div>
      <div className="inpaint-canvas-wrap" style={{ maxHeight: "62vh", overflow: "auto" }}>
        <canvas
          ref={canvasRef}
          className="inpaint-canvas"
          style={{ width: `${scale * 100}%`, maxWidth: "100%", cursor: "crosshair", touchAction: "none", backgroundImage:`url(${src})`, backgroundSize:"100% 100%", backgroundRepeat:"no-repeat" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <p className="inpaint-hint">用画笔涂抹出需要修改的区域（红色为已选区），再用橡皮擦修正；然后输入修改咒语并生成。</p>
    </div>
  );
}
