import type {WorkflowType} from "./types";

export type ApiProviderType="openai-compatible"|"syc-openai-compatible"|"fashn"|"bfl"|"volcengine"|"flux"|"custom";
export type ProviderTestStatus="untested"|"success"|"failed";
export type SycTestStatus="untested"|"incomplete"|"success"|"failed";
export type ModelSlot="primary"|"fallback";

export type ApiProviderPublic={
  id:string;
  name:string;
  type:ApiProviderType;
  baseUrl:string;
  apiKeyMasked:string;
  hasApiKey:boolean;
  defaultModel:string;
  enabled:boolean;
  notes?:string;
  lastTestStatus:ProviderTestStatus;
  lastTestAt?:string;
  lastError?:string;
  createdAt:string;
  updatedAt:string;
  imageModel?:string;
  chatModel?:string;
  stream?:boolean;
  partialImages?:number;
  returnBase64?:boolean;
  codexCliCompatible?:boolean;
  timeoutSeconds?:number;
  lastImageTestStatus?:SycTestStatus;
  lastImageTestAt?:string;
  lastImageTestError?:string;
  lastTestLatencyMs?:number;
};

export type ApiProviderSecretRecord=Omit<ApiProviderPublic,"apiKeyMasked"|"hasApiKey">&{
  encryptedApiKey:string;
  apiKeyMasked:string;
};

export type SycConfigPublic={
  id:string;
  name:string;
  providerType:"syc-openai-compatible";
  baseUrl:string;
  apiKeyConfigured:boolean;
  apiKeyMask:string;
  imageModel:string;
  chatModel:string;
  stream:boolean;
  partialImages:number;
  returnBase64:boolean;
  codexCliCompatible:boolean;
  timeoutSeconds:number;
  enabled:boolean;
  lastTestStatus:SycTestStatus;
  lastTestAt?:string;
  lastError?:string;
  lastImageTestStatus:SycTestStatus;
  lastImageTestAt?:string;
  lastImageTestError?:string;
  lastTestLatencyMs?:number;
};

export type SycConfigInput={
  name:string;
  baseUrl:string;
  apiKey?:string;
  imageModel:string;
  chatModel?:string;
  stream:boolean;
  partialImages:number;
  returnBase64:boolean;
  codexCliCompatible:boolean;
  timeoutSeconds:number;
  enabled:boolean;
};

export type WorkflowModelSelection={providerId:string;model:string};
export type WorkflowModelBinding={primary?:WorkflowModelSelection;fallback?:WorkflowModelSelection};
export type WorkflowModelBindings=Record<WorkflowType,WorkflowModelBinding>;

export type ProviderRuntimeConfig={
  id:string;
  name:string;
  type:ApiProviderType;
  baseUrl:string;
  apiKey:string;
  model:string;
  source:"stored"|"environment";
  syc?:{
    stream:boolean;
    partialImages:number;
    returnBase64:boolean;
    codexCliCompatible:boolean;
    timeoutSeconds:number;
  };
};

export type WorkflowRuntimeModel={
  slot:ModelSlot;
  configured:boolean;
  providerId?:string;
  providerName:string;
  providerType:string;
  model:string;
  source:"stored"|"environment"|"none";
  error?:string;
};

export type WorkflowRuntimeSummary=Record<WorkflowType,{primary:WorkflowRuntimeModel;fallback:WorkflowRuntimeModel}>;

export const EMPTY_WORKFLOW_BINDINGS:WorkflowModelBindings={tryon:{},pose:{},recolor:{}};
