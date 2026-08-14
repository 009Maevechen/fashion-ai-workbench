export type WorkflowType = "tryon" | "pose" | "recolor";
export type GenerationMode = "fast" | "standard" | "quality";
export type GenerationStatus = "idle"|"uploading"|"queued"|"generating"|"success"|"failed"|"awaiting_confirmation"|"confirmed"|"needs_review"|"stale"|"interrupted";
export type GenerationResult = { id:string; workflow:WorkflowType; provider:string; model:string; status:GenerationStatus; inputImages:string[]; outputImages:string[]; createdAt:string; finishedAt?:string; error?:string };
export type GenerateInput = { workflow:WorkflowType; provider?:string; model?:string; images:string[]; prompt:string; options:{ mode:GenerationMode; sku:string; candidate?:number; color?:string; seed?:number } };
export type ProviderResult = { provider:string; model:string; temporaryImageUrl?:string; imageBase64?:string; mimeType?:string; trustedImageHost?:string };
export interface ImageProvider { generate(input:GenerateInput, model:string):Promise<ProviderResult> }
