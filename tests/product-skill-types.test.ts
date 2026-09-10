import test from "node:test";
import assert from "node:assert/strict";
import {productSkillInputFromJson,productSkillReady} from "../src/lib/product-skill-types";

test("VisualPlan can be imported as an editable product skill without inventing rules",()=>{
  const input=productSkillInputFromJson({
    schemaVersion:"1.0",
    sku:"SY-14007",
    garmentProfile:{garmentType:{value:"宽松裤装"}},
    protectedDetails:["保持侧边条纹"],
    forbiddenChanges:["禁止增加口袋"],
    riskWarnings:["背面不可见"],
    consistencyChecklist:["条纹数量一致"],
    promptRules:{garmentRules:["产品图是服装依据"],qualityRules:["保持高清"]},
  });
  assert.equal(input.name,"SY-14007 产品 Skill");
  assert.deepEqual(input.productTypes,["裤装"]);
  assert.equal(input.source,"visual_plan");
  assert.deepEqual(input.promptRules,["产品图是服装依据","保持高清"]);
});

test("product skill is ready only when protection, prohibition and QC rules are complete",()=>{
  const base={name:"裤装守护",productTypes:["裤装" as const],workflows:["tryon" as const],protectedDetails:["保持裤长"],forbiddenChanges:["禁止改口袋"],consistencyChecklist:["裤长一致"]};
  assert.equal(productSkillReady(base),true);
  assert.equal(productSkillReady({...base,consistencyChecklist:[]}),false);
});
