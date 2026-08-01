import "server-only";
import type {ProviderRuntimeConfig} from "../../provider-settings-types";
import {sycEndpoint} from "./config";
import {readSycResponse,sycNetworkError} from "./errors";
import {parseSycModels} from "./response-parser";

export async function fetchSycModels(config:ProviderRuntimeConfig){
  let response:Response;
  const started=Date.now();
  try{response=await fetch(sycEndpoint(config.baseUrl,"models"),{headers:{Authorization:`Bearer ${config.apiKey}`,Accept:"application/json"},signal:AbortSignal.timeout(Math.min((config.syc?.timeoutSeconds||600)*1000,60000))})}catch(error){throw sycNetworkError(error)}
  const data=await readSycResponse(response);
  return {models:parseSycModels(data),httpStatus:response.status,latencyMs:Date.now()-started};
}
