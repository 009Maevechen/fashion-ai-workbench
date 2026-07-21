import "server-only";
import type { GenerationMode, WorkflowType } from "./types";

type ModelChoice={provider:string;model:string};
export function getModel(workflow:WorkflowType, mode:GenerationMode):ModelChoice {
  if(workflow==="tryon"){
    if(process.env.TRYON_PROVIDER==="custom")return {provider:"custom",model:customModel("TRYON")};
    if(mode==="quality")return {provider:"fashn",model:process.env.FASHN_TRYON_MODEL||"tryon-max"};
    if((process.env.TRYON_PROVIDER||"bfl")==="volcengine")return {provider:"volcengine",model:seedream()};
    return {provider:"bfl",model:"FLUX Virtual Try-On"};
  }
  if(workflow==="pose"){
    if(process.env.POSE_PROVIDER==="custom")return {provider:"custom",model:customModel("POSE")};
    if((process.env.POSE_PROVIDER||"volcengine")==="volcengine")return {provider:"volcengine",model:seedream()};
    return mode==="fast"?{provider:"flux",model:required("FLUX_KLEIN_MODEL","快速姿势模型 FLUX_KLEIN_MODEL 未配置")}:mode==="quality"?{provider:"flux",model:required("FLUX_PRO_MODEL","精细姿势模型 FLUX_PRO_MODEL 未配置")}:{provider:"volcengine",model:seedream()};
  }
  if(process.env.RECOLOR_PROVIDER==="custom")return {provider:"custom",model:customModel("RECOLOR")};
  if((process.env.RECOLOR_PROVIDER||"volcengine")==="volcengine")return {provider:"volcengine",model:seedream()};
  return mode==="quality"?{provider:"flux",model:required("FLUX_PRO_MODEL","精细复色模型 FLUX_PRO_MODEL 未配置")}:{provider:"volcengine",model:seedream()};
}
export function assertModelConfigured(workflow:WorkflowType,mode:GenerationMode){
  const choice=getModel(workflow,mode);
  if(choice.provider==="fashn")required("FASHN_API_KEY","FASHN Try-On Max 尚未配置：请先在服务器 .env.local 中填写 FASHN_API_KEY，然后重启工作台");
  if(choice.provider==="bfl")required("BFL_API_KEY","BFL FLUX Virtual Try-On 尚未配置：请先在服务器环境变量中填写 BFL_API_KEY");
  if(choice.provider==="volcengine")required("VOLCENGINE_API_KEY","火山方舟 API 尚未配置：请先在服务器环境变量中填写 VOLCENGINE_API_KEY");
  if(choice.provider==="flux")required("FLUX_API_KEY","FLUX.2 API 尚未配置：请先在服务器环境变量中填写 FLUX_API_KEY");
  if(choice.provider==="custom"){
    required("CUSTOM_IMAGE_API_KEY","自定义图像 API 尚未配置：请先在服务器 .env.local 中填写 CUSTOM_IMAGE_API_KEY");
    required("CUSTOM_IMAGE_API_ENDPOINT","自定义图像 API 尚未配置：请先填写 CUSTOM_IMAGE_API_ENDPOINT");
  }
  return choice;
}
function seedream(){return process.env.SEEDREAM_ENDPOINT_ID||process.env.SEEDREAM_MODEL||required("SEEDREAM_MODEL","Seedream 模型或接入点未配置（SEEDREAM_MODEL / SEEDREAM_ENDPOINT_ID）")}
function customModel(workflow:"TRYON"|"POSE"|"RECOLOR"){return process.env[`CUSTOM_${workflow}_MODEL`]||process.env.CUSTOM_IMAGE_MODEL||required(`CUSTOM_${workflow}_MODEL`,`自定义${workflow==="TRYON"?"换装":workflow==="POSE"?"姿势":"复色"}模型名称未配置`)}
export function required(name:string,message?:string){const value=process.env[name];if(!value)throw new Error(message||`必要配置 ${name} 未配置`);return value}
export function timeout(){return Number(process.env.AI_REQUEST_TIMEOUT_MS||180000)}
export function providerHealth(){
  const flux=Boolean(process.env.FLUX_API_KEY&&process.env.FLUX_API_BASE_URL);
  const tryonProvider:"bfl"|"volcengine"|"custom"=process.env.TRYON_PROVIDER==="custom"?"custom":process.env.TRYON_PROVIDER==="volcengine"?"volcengine":"bfl";
  const poseProvider:"flux"|"volcengine"|"custom"=process.env.POSE_PROVIDER==="custom"?"custom":process.env.POSE_PROVIDER==="volcengine"?"volcengine":"flux";
  const recolorProvider:"flux"|"volcengine"|"custom"=process.env.RECOLOR_PROVIDER==="custom"?"custom":process.env.RECOLOR_PROVIDER==="volcengine"?"volcengine":"flux";
  const custom=Boolean(process.env.CUSTOM_IMAGE_API_KEY&&process.env.CUSTOM_IMAGE_API_ENDPOINT&&(process.env.CUSTOM_IMAGE_MODEL||process.env.CUSTOM_TRYON_MODEL||process.env.CUSTOM_POSE_MODEL||process.env.CUSTOM_RECOLOR_MODEL));
  return {
    bfl:Boolean(process.env.BFL_API_KEY),
    fashn:Boolean(process.env.FASHN_API_KEY),
    volcengine:Boolean(process.env.VOLCENGINE_API_KEY&&(process.env.SEEDREAM_ENDPOINT_ID||process.env.SEEDREAM_MODEL)),
    flux,
    fluxKlein:Boolean(flux&&process.env.FLUX_KLEIN_MODEL),
    fluxPro:Boolean(flux&&process.env.FLUX_PRO_MODEL),
    custom,
    tryonProvider,
    poseProvider,
    recolorProvider,
  };
}
