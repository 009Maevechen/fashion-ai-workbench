import {z} from "zod";

const productType=z.enum(["上衣","裤装","连衣裙","半身裙","套装"]);
const workflow=z.enum(["product","tryon","pose","recolor","qc"]);
const lines=z.array(z.string().trim().min(1).max(300)).max(80);

export const productSkillSchema=z.object({
  name:z.string().trim().min(1).max(100),description:z.string().max(1000).optional(),enabled:z.boolean(),
  productTypes:z.array(productType).min(1).max(5),workflows:z.array(workflow).min(1).max(5),
  analysisFocus:lines,protectedDetails:lines,forbiddenChanges:lines,riskWarnings:lines,consistencyChecklist:lines,promptRules:lines,
  source:z.enum(["manual","visual_plan","imported"]).optional(),
});

export const productSkillUpdateSchema=productSkillSchema.partial().extend({archived:z.boolean().optional()});
