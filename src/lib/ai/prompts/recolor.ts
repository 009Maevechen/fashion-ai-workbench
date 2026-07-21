export const RECOLOR_PROMPT_VERSION="recolor-v1";
export function recolorPrompt(area:string,color:string,hex:string,protectedAreas:string[],extra:string){return `任务：服装商品精准复色。第一张图片是需要修改颜色的模特商品图。如果有第二张图片，它只是目标颜色样本。只提取颜色本身，严禁从参考图复制服装款式、版型、长度、领口、袖口、纽扣、图案、印花、材质、纹理或任何结构。只修改第一张图片中指定服装区域的主体面料颜色。
目标服装区域：${area}\n目标颜色名称：${color}\n目标HEX色值：${hex||"未指定"}
必须保持同一个模特、姿势身体比例、背景光线阴影构图、服装版型长度轮廓和全部结构细节、褶皱光泽面料质感、3:4比例；每次只输出一张独立图片。
以下区域必须保持不变：${protectedAreas.join("、")}\n补充要求：${extra}
禁止改变模特皮肤头发身体、背景、未选择区域、保护区域、服装结构长度；禁止多宫格文字水印；不得直接返回原图。`}
