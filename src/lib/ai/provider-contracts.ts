import type {GenerateInput} from "./types";

export function providerInputImageFilename(workflow:GenerateInput["workflow"],index:number,extension:string){
  if(workflow==="tryon")return index===0?`01-model-reference-keep-person-pose-scene.${extension}`:`02-garment-product-use-clothing-only.${extension}`;
  if(workflow==="pose")return index===0?`01-source-model-keep-garment.${extension}`:`02-pose-reference-use-pose-only.${extension}`;
  return index===0?`01-source-image-recolor-garment-only.${extension}`:`02-color-reference-use-color-only.${extension}`;
}

export type OpenAiCompatibleResponse={data?:Array<{url?:string;b64_json?:string;image_url?:string}>;output?:Array<{url?:string;b64_json?:string;image_url?:string}|string>;images?:Array<{url?:string;b64_json?:string}|string>;result?:{url?:string;b64_json?:string}|string;url?:string;image?:string;error?:{message?:string}|string;message?:string};

export function buildOpenAiCompatibleRequest(input:GenerateInput,model:string){return {model,prompt:input.prompt,image:input.images.length===1?input.images[0]:input.images,images:input.images,n:1,response_format:"b64_json",size:"1024x1536",...(input.options.seed===undefined?{}:{seed:input.options.seed})}}
export function parseOpenAiCompatibleImage(data:OpenAiCompatibleResponse){const item=data.data?.[0]||data.output?.[0]||data.images?.[0]||data.result,object=(typeof item==="object"&&item?item:undefined) as {url?:string;b64_json?:string;image_url?:string}|undefined,temporaryImageUrl=typeof item==="string"&&(item.startsWith("https://")||item.startsWith("http://"))?item:object?.url||object?.image_url||data.url;let imageBase64=object?.b64_json||data.image||(typeof item==="string"&&!temporaryImageUrl?item:undefined),mimeType="image/jpeg";if(imageBase64?.startsWith("data:")){const parts=imageBase64.match(/^data:([^;,]+);base64,(.+)$/);if(parts){mimeType=parts[1];imageBase64=parts[2]}}if(!temporaryImageUrl&&!imageBase64)throw new Error("中转站响应中没有可读取的图片，请确认模型支持图片生成或编辑");return {temporaryImageUrl,imageBase64,mimeType}}

export function buildBflRequest(input:GenerateInput){
  return {
    person:input.images[0],
    garment:input.images[1],
    prompt:input.prompt,
    output_format:"jpeg",
  };
}

export function buildFashnRequest(input:GenerateInput,model:string){
  const generationMode=input.options.mode==="fast"?"fast":input.options.mode==="quality"?"quality":"balanced";
  return {
    model_name:model,
    inputs:{
      model_image:input.images[0],
      product_image:input.images[1],
      prompt:input.prompt,
      generation_mode:generationMode,
      resolution:input.options.mode==="fast"?"1k":"2k",
      num_images:1,
      output_format:"jpeg",
      return_base64:false,
      ...(input.options.seed===undefined?{}:{seed:input.options.seed}),
    },
  };
}
