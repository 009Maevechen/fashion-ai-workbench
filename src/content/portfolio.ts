export type PortfolioProject={
  slug:string; title:string; shortTitle:string; year:string; category:string; summary:string;
  description:string; role:string; tools:string[]; tags:string[]; placeholderLabel:string; highlights:string[];
};

export const workflowSteps=["项目背景","业务痛点","人工操作流程","扣子框架验证","Codex重新搭建工作台","产品图换装","服装复色","三姿势生成","细节质检","最终导出","失败案例与迭代"];

export const featuredProjects:PortfolioProject[]=[
  {slug:"modelflow",title:"ModelFlow 跨境电商AI视觉工作台",shortTitle:"ModelFlow",year:"2026",category:"AI Workflow",summary:"把分散的换装、姿势、复色与审核步骤，组织为可复用的商品图生产流程。",description:"从扣子框架验证出发，使用 Codex 辅助重新搭建面向跨境服装商品图的 AI 视觉工作台。",role:"工作流设计 / 产品设计 / 视觉设计",tools:["Codex","ComfyUI","ChatGPT","Gemini"],tags:["Workflow","Product Design","AIGC"],placeholderLabel:"工作台界面截图待补充",highlights:["项目与 SKU 管理","换装、姿势、复色串联","细节质检与失败重试"]},
  {slug:"fashion-models",title:"跨境服装AI模特商品图",shortTitle:"AI Fashion Models",year:"2026",category:"Commerce AIGC",summary:"围绕真实服装素材完成模特换装、颜色扩展与三种姿势生成。",description:"以商品一致性为前提，探索跨境服装从原始产品图到多姿势模特图的稳定生成方式。",role:"AIGC 视觉设计 / 提示词设计 / 质量审核",tools:["ComfyUI","Gemini","Midjourney","ChatGPT"],tags:["E-commerce","Try-on","Quality"],placeholderLabel:"服装模特成果图待补充",highlights:["服装结构保持","颜色一致性","三姿势批量生成"]},
  {slug:"maritime-silk-road",title:"海上丝绸之路信息可视化",shortTitle:"Maritime Silk Road",year:"2025",category:"Information Design",summary:"以航海、贸易和纹样为线索，将复杂历史信息转化为清晰的视觉系统。",description:"广东省计算机设计大赛省二等奖项目，以信息层级、图形语言和系列化延展组织内容。",role:"信息设计 / 视觉系统 / 文创延展",tools:["Illustrator","Photoshop"],tags:["Data Visualisation","Editorial","Award"],placeholderLabel:"信息可视化长图待补充",highlights:["省二等奖","信息层级设计","系列文创延展"]},
  {slug:"happy-cloud",title:"Happy Cloud AIGC IP全案",shortTitle:"Happy Cloud",year:"2026",category:"Generative Visual Design",summary:"从角色概念、三视图到表情、服装和周边延展的 AIGC IP 系统。",description:"以“希望播种者”为角色核心，完成形象设定与多场景商业延展。",role:"IP 设定 / AIGC 视觉 / 周边设计",tools:["Midjourney","ChatGPT","Photoshop"],tags:["IP Design","AIGC","Brand System"],placeholderLabel:"IP主视觉待补充",highlights:["角色三视图","表情与服装延展","周边应用系统"]},
];

export function getProject(slug:string){return featuredProjects.find(project=>project.slug===slug)}
