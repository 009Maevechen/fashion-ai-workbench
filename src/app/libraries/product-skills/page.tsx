import ProductSkillManager from "@/components/ProductSkillManager";
import {listProductSkills} from "@/lib/product-skills";

export const dynamic="force-dynamic";

export default async function ProductSkillsPage(){
  const skills=await listProductSkills();
  return <><header className="page-head"><div><div className="eyebrow">Product skills</div><h1>产品 Skill</h1><p>把商品识别重点、服装设计守护、禁止修改项和质量检查保存为可复用模板。</p></div></header><ProductSkillManager initialSkills={skills}/></>;
}
