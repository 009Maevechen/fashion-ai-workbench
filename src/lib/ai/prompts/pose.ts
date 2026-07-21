export const POSE_PROMPT_VERSION="pose-v1";
export const POSES=["自然站立，身体正面或轻微侧向镜头，双手自然放置，完整清晰地展示服装。","模特轻微迈步或自然转移重心，动作自然，不遮挡服装重点。","身体轻微侧转，一只手自然弯曲，展示服装侧面、袖型、腰线、裙型或裤型。"];
export function posePrompt(pose:string,productType:string,shot:string,face:boolean,background:boolean,details:string){return `任务：在严格保持商品和模特一致的前提下，改变模特姿势。必须保持同一个模特、同一套服装、颜色版型长度面料、全部服装细节、相同背景光线拍摄风格、正常人体比例、3:4竖版；每次只输出一张独立图片。
新姿势：${pose}\n商品类型：${productType}\n景别：${shot}\n露脸要求：${face?"可以露脸并保持身份":"不露脸"}\n背景要求：${background?"严格保持":"可自然调整"}\n细节保护：${details}
禁止更换模特、改变服装设计或颜色、增删细节、拼图多宫格、文字水印边框、额外肢体或畸形、直接返回输入图。`}
