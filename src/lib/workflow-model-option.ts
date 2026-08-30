import type {ApiProviderPublic,ModelWorkflowType} from "./ai/provider-settings-types";

/** 为每种工作流选择真正对应的模型字段，避免把图片模型分给文本矫正。 */
export function modelForWorkflow(provider:ApiProviderPublic,workflow:ModelWorkflowType){
  if(workflow==="product"||workflow==="qc")return provider.visionModel||provider.chatModel;
  if(["research","assistant","correction","prompt-optimize"].includes(workflow))return provider.chatModel;
  return provider.defaultModel;
}
