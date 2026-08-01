import "server-only";
import {getModel} from "./config";
import type {GenerateInput,ImageProvider} from "./types";
import type {ProviderRuntimeConfig} from "./provider-settings-types";
import {BflProvider} from "./providers/bfl";
import {FashnProvider} from "./providers/fashn";
import {VolcengineProvider} from "./providers/volcengine";
import {FluxProvider} from "./providers/flux";
import {CustomProvider} from "./providers/custom";
import {OpenAiCompatibleProvider} from "./providers/openai-compatible";
import {SycImageProvider} from "./providers/syc/image-provider";

export async function generateImage(input:GenerateInput,runtime?:ProviderRuntimeConfig){
  const legacy=input.provider&&input.model?{provider:input.provider,model:input.model}:getModel(input.workflow,input.options.mode);
  const model=runtime?.model||legacy.model,type=runtime?.type||legacy.provider;
  let provider:ImageProvider;
  if(type==="openai-compatible")provider=new OpenAiCompatibleProvider(runtime!);
  else if(type==="syc-openai-compatible")provider=new SycImageProvider(runtime!);
  else if(type==="bfl")provider=new BflProvider(runtime);
  else if(type==="fashn")provider=new FashnProvider(runtime);
  else if(type==="volcengine")provider=new VolcengineProvider(runtime);
  else if(type==="flux")provider=new FluxProvider(runtime);
  else if(type==="custom")provider=runtime?new OpenAiCompatibleProvider(runtime):new CustomProvider();
  else throw new Error(`不支持的 Provider：${type}`);
  return provider.generate(input,model);
}
