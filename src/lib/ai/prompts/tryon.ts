import {faceVisibilityPrompt} from "./face-visibility";

export const TRYON_PROMPT_VERSION="tryon-v1";
export function tryonPrompt(productType:string,description:string,details:string,showFace=false){return `任务：真实服装商品换装。
服装类型：${productType}。必须按照该类目的结构和穿着方式进行换装，不得改成其他服装类目。
人物参考图决定需要保留的模特、姿势、身体比例、景别、背景和光线。服装参考图决定需要穿到模特身上的真实服装商品。把服装参考图中的服装真实地穿到人物参考图中的模特身上。
${faceVisibilityPrompt(showFace)}
必须保持：服装原有版型、长度和轮廓；领口、袖口、肩部和下摆结构；纽扣数量、颜色和位置；印花、图案、拼接和包边位置；面料纹理、褶皱和材质；商品原始颜色；模特身份、姿势、身体比例、景别、背景和光线；真实自然的电商摄影效果。
禁止：更换模特；改变服装长度；增加或删除结构装饰；直接返回原模特图；生成多宫格、对比图、文字或水印；每次只输出一张独立换装图。
服装描述：${description||"未填写"}
重点细节：${details}`}
