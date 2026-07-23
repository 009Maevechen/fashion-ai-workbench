export type ColorAdjustment={hue:number;saturation:number;lightness:number};
export type RgbColor={r:number;g:number;b:number};

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
export const DEFAULT_COLOR_ADJUSTMENT:ColorAdjustment={hue:0,saturation:0,lightness:0};

export function normalizeHex(value?:string){
  const raw=(value||"").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(raw)?raw:undefined;
}
export function hexToRgb(value:string):RgbColor{
  const hex=normalizeHex(value)||"#000000";
  return {r:parseInt(hex.slice(1,3),16),g:parseInt(hex.slice(3,5),16),b:parseInt(hex.slice(5,7),16)};
}
export function rgbToHex({r,g,b}:RgbColor){
  return `#${[r,g,b].map(value=>Math.round(clamp(value,0,255)).toString(16).padStart(2,"0")).join("")}`.toUpperCase();
}
function rgbToHsl({r,g,b}:RgbColor){
  const red=r/255,green=g/255,blue=b/255,max=Math.max(red,green,blue),min=Math.min(red,green,blue),delta=max-min;
  let hue=0;if(delta){if(max===red)hue=60*(((green-blue)/delta)%6);else if(max===green)hue=60*((blue-red)/delta+2);else hue=60*((red-green)/delta+4)}
  if(hue<0)hue+=360;
  const lightness=(max+min)/2,saturation=delta===0?0:delta/(1-Math.abs(2*lightness-1));
  return {hue,saturation:saturation*100,lightness:lightness*100};
}
function hslToRgb(hue:number,saturation:number,lightness:number):RgbColor{
  const h=((hue%360)+360)%360,s=clamp(saturation,0,100)/100,l=clamp(lightness,0,100)/100,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  const [red,green,blue]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return {r:(red+m)*255,g:(green+m)*255,b:(blue+m)*255};
}
export function adjustHex(baseHex:string,adjustment:ColorAdjustment){
  const base=rgbToHsl(hexToRgb(baseHex));
  return rgbToHex(hslToRgb(base.hue+adjustment.hue,base.saturation+adjustment.saturation,base.lightness+adjustment.lightness));
}
