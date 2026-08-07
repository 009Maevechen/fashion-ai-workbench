import {faceVisibilityPrompt} from "./face-visibility";
import {protectedClothingForArea,type RecolorGarmentArea} from "../../recolor-scope";

export const RECOLOR_PROMPT_VERSION="recolor-v2-color-block-layout";
export function recolorPrompt(area:string,color:string,hex:string,protectedAreas:string[],extra:string,showFace=false,trimColorName="",trimHex=""){const lockedArea=area as RecolorGarmentArea;return `任务：服装商品精准复色。第一张图片是需要修改颜色的模特商品图。如果有第二张图片，它只是目标颜色样本。只提取颜色本身，严禁从参考图复制服装款式、版型、长度、领口、袖口、纽扣、图案、印花、材质、纹理或任何结构。只修改第一张图片中指定服装区域的主体面料颜色。
目标服装区域：${area}\n目标颜色名称：${color}\n目标HEX色值：${hex||"未指定"}
绝对不得改色的其他服饰：${protectedClothingForArea(lockedArea)}。这些区域的颜色、材质、纹理、阴影和亮度必须与第一张输入图逐像素视觉一致。
指定边饰颜色：${trimColorName||"沿用第一张输入图的原色"}${trimHex?`（${trimHex}）`:""}
${faceVisibilityPrompt(showFace)}
复色前必须检查第一张输入图的色块布局。领口包边、袖口荷叶边、下摆、门襟、拼接和其他撞色区域的位置、宽度、形状、数量必须与原服装完全一致；不得把主色覆盖到包边，不得新增、删除或移动色块。若指定了边饰颜色，只把原服装中已存在的边饰区域统一调整为该颜色。
必须保持同一个模特、姿势身体比例、背景光线阴影构图、服装版型长度轮廓和全部结构细节、褶皱光泽面料质感、3:4比例；每次只输出一张独立图片。
以下区域必须保持不变：${protectedAreas.join("、")}\n补充要求：${extra}
禁止改变模特皮肤头发身体、背景、未选择区域、保护区域、服装结构长度；禁止多宫格文字水印；不得直接返回原图。`}
