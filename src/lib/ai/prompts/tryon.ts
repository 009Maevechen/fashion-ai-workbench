import {faceVisibilityPrompt} from "./face-visibility";

export const TRYON_PROMPT_VERSION="tryon-v2-material-design-lock";
export function tryonPrompt(productType:string,description:string,details:string,showFace=false){return `任务：真实服装商品换装。
服装类型：${productType}。必须按照该类目的结构和穿着方式进行换装，不得改成其他服装类目。
人物参考图决定需要保留的模特、姿势、身体比例、景别、背景和光线。服装参考图决定需要穿到模特身上的真实服装商品。把服装参考图中的服装真实地穿到人物参考图中的模特身上。
${faceVisibilityPrompt(showFace)}
必须保持：服装原有版型、长度和轮廓；领口、袖口、肩部和下摆结构；纽扣数量、颜色和位置；印花、图案、拼接和包边位置；商品原始颜色；模特身份、姿势、身体比例、景别、背景和光线；真实自然的电商摄影效果。
材质与设计强制锁定：必须忠实复刻服装参考图中的面料材质、织法/针法、罗纹或纹理的方向与密度、粗细、绒感、透视度、光泽、褶皱响应和垂坠感；渐变方向、过渡范围、色块边界、拼接比例和特殊装饰布局必须保持一致。不得把针织变成光滑布料，不得磨平纹理，不得重新设计渐变、色块或局部结构。
禁止：更换模特；改变服装长度；增加或删除结构装饰；直接返回原模特图；生成多宫格、对比图、文字或水印；每次只输出一张独立换装图。
服装描述：${description||"未填写"}
重点细节：${details}`}
