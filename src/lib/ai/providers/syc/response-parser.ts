type ImageResult={temporaryImageUrl?:string;imageBase64?:string;mimeType:string};

function fromString(value:string):ImageResult|undefined{
  if(/^https?:\/\//i.test(value))return {temporaryImageUrl:value,mimeType:"image/jpeg"};
  const data=value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if(data)return {imageBase64:data[2].replace(/\s/g,""),mimeType:data[1].toLowerCase()};
  if(/^[A-Za-z0-9+/=\s]{100,}$/.test(value))return {imageBase64:value.replace(/\s/g,""),mimeType:"image/png"};
}
function walk(value:unknown,depth=0):ImageResult|undefined{
  if(depth>8||value===null||value===undefined)return;
  if(typeof value==="string")return fromString(value);
  if(Array.isArray(value)){for(const item of value){const found=walk(item,depth+1);if(found)return found}return}
  if(typeof value!=="object")return;
  const object=value as Record<string,unknown>;
  for(const key of ["b64_json","image_base64","base64","image","url","image_url"]){
    const candidate=object[key];if(typeof candidate==="string"){const found=fromString(candidate);if(found)return found}
  }
  for(const key of ["data","output","images","result","content"]){const found=walk(object[key],depth+1);if(found)return found}
}

export function parseSycImageResponse(value:unknown):ImageResult{
  const result=walk(value);
  if(!result)throw new Error("SYC 响应中没有可读取的真实图片，请确认当前模型支持图片生成或编辑");
  if(result.imageBase64){
    const bytes=Buffer.from(result.imageBase64,"base64");
    if(bytes.length<100||bytes.toString("base64").replace(/=+$/,"")!==result.imageBase64.replace(/\s/g,"").replace(/=+$/,""))throw new Error("SYC 返回的 Base64 图片数据无效");
  }
  return result;
}

export function parseSycModels(value:unknown){
  const data=(value as {data?:unknown})?.data;
  if(!Array.isArray(data))throw new Error("SYC 模型接口响应中没有 data 数组");
  const models=data.map(item=>typeof item==="string"?item:typeof item==="object"&&item&&typeof (item as {id?:unknown}).id==="string"?(item as {id:string}).id:"").filter(Boolean);
  if(!models.length)throw new Error("SYC 模型接口没有返回可用模型");
  return [...new Set(models)].sort();
}
