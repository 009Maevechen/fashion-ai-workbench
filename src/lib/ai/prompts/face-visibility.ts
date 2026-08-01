export function faceVisibilityPrompt(showFace:boolean){
  return showFace
    ?"露脸要求：允许露出脸部；必须保持输入人物的真实身份、五官和脸部特征，不得换脸或生成另一张脸。"
    :"露脸要求：最终图片不得露出脸部。优先通过保持头部在画面外、自然背对镜头或由原有构图自然遮挡脸部实现；不得生成、补画或露出任何人物脸部。";
}
