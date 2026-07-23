"use client";

import {useMemo,useState} from "react";
import type {Job,ProductAttributes,ProductProfile,ProductType,Project,ProjectAssets} from "@/lib/db";
import AssetUploadCard,{type LocalAsset} from "./AssetUploadCard";
import ImagePreviewDialog from "./ImagePreviewDialog";
import ClearAssetsButton from "./ClearAssetsButton";
import type {Runner} from "./types";
import {hasClearableSourceAssets} from "@/lib/asset-cleanup";
import {DEFAULT_PROTECTION_ITEMS} from "@/lib/product-structure";

const TYPES:ProductType[]=["上衣","裤装","连衣裙","半身裙","套装"];
const ATTRIBUTE_OPTIONS:Record<keyof ProductAttributes,string[]>={
  mainColor:["米白色","白色","黑色","灰色","粉色","红色","棕色","蓝色","绿色","其他"],
  printType:["纯色","花卉印花","字母印花","条纹","格纹","拼色","其他"],
  neckline:["圆领","V领","方领","翻领","立领","一字领","其他"],
  sleeveType:["无袖","短袖","五分袖","七分袖","长袖","泡泡袖","荷叶袖","其他"],
  garmentLength:["短款","常规款","中长款","长款","其他"],
  fit:["紧身","修身","合体","宽松","廓形","其他"],
  fabric:["针织","雪纺","棉","麻","牛仔","涤纶","皮革","其他"],
  fabricTexture:["平纹","罗纹","粗针织","细针织","提花","雪纺纹理","牛仔纹理","其他"],
  placketType:["无门襟","套头","单排扣","双排扣","拉链","暗扣","系带","其他"],
  buttonCount:["0","1","2","3","4","5","6","7","8","其他"],
  pocketDetails:["无口袋","左胸口袋","右胸口袋","双胸口袋","两侧口袋","贴袋","插袋","其他"],
  trimColor:["无包边","白色","黑色","同色","撞色","其他"],
  printPosition:["无印花","左胸","右胸","正面中央","背面","袖口","下摆","满版","其他"],
  asymmetry:["否","是：左侧不同","是：右侧不同","其他"],
  belt:["无","有","可拆卸","其他"],
  drawstring:["无","领口抽绳","腰部抽绳","下摆抽绳","其他"],
  pleats:["无","胸前","腰部","袖口","下摆","其他"],
  slit:["无","侧开叉","后开叉","前开叉","其他"],
  transparency:["不透","微透","半透","其他"],
  lining:["无","有","局部","其他"],
  elasticity:["无弹","微弹","中弹","高弹","其他"],
};
const ATTRIBUTE_LABELS:Record<keyof ProductAttributes,string>={mainColor:"商品主颜色",printType:"印花类型",neckline:"领型",sleeveType:"袖型",garmentLength:"衣长",fit:"版型",fabric:"面料类型",fabricTexture:"面料纹理",placketType:"门襟类型",buttonCount:"纽扣数量",pocketDetails:"口袋数量和位置",trimColor:"包边颜色",printPosition:"印花位置",asymmetry:"是否左右不对称",belt:"是否有腰带",drawstring:"是否有抽绳",pleats:"是否有褶皱",slit:"是否有开叉",transparency:"透明度",lining:"是否有内衬",elasticity:"弹性"};
type SingleAssetKey="garmentImage"|"productFrontImage"|"productBackImage"|"productDetailImage"|"printCloseupImage"|"buttonCloseupImage"|"brandTagImage"|"modelReferenceImage"|"fabricTextureImage"|"colorReferenceImage";
const ASSET_FIELDS:{key:SingleAssetKey;label:string;description:string;name:string;required?:boolean}[]=[
  {key:"garmentImage",label:"产品主图",description:"必填，用于换装的主商品图",name:"garment",required:true},
  {key:"productFrontImage",label:"产品正面图",description:"正面完整结构参考",name:"product-front"},
  {key:"productBackImage",label:"产品背面图",description:"背面版型与结构参考",name:"product-back"},
  {key:"productDetailImage",label:"细节图",description:"领口、袖口、下摆等细节",name:"product-detail"},
  {key:"printCloseupImage",label:"印花特写",description:"印花位置、颜色与边缘参考",name:"print-closeup"},
  {key:"buttonCloseupImage",label:"纽扣特写",description:"纽扣数量、颜色与形状参考",name:"button-closeup"},
  {key:"brandTagImage",label:"品牌／标签图",description:"吊牌、水洗标或包装标签",name:"brand-tag"},
  {key:"modelReferenceImage",label:"默认模特参考图",description:"可选，换装步骤也可单独上传",name:"model-reference"},
  {key:"fabricTextureImage",label:"面料特写",description:"近距离面料和纹理参考",name:"fabric-texture"},
  {key:"colorReferenceImage",label:"多颜色参考图",description:"可选，用于后续逐颜色复色",name:"color-reference"},
];

export default function ProductDetailsPanel({p,jobs,busy,run,persistAsset,deleteAsset,clearSourceAssets,saveProject,onNext}:{p:Project;jobs:Job[];busy:boolean;run:Runner;persistAsset:(file:File|undefined,key:keyof ProjectAssets,name:string,index?:number)=>Promise<string>;deleteAsset:(key:keyof ProjectAssets,index?:number)=>Promise<void>;clearSourceAssets:()=>Promise<Project>;saveProject:(patch:Partial<Project>)=>Promise<Project>;onNext:()=>void}){
  const initialProfile=p.profile||{};
  const [sku,setSku]=useState(p.sku),[name,setName]=useState(p.productName),[type,setType]=useState<ProductType>(p.productType);
  const [profile,setProfile]=useState<ProductProfile>({...initialProfile,priority:initialProfile.priority||"normal",reviewStatus:initialProfile.reviewStatus||"draft",tags:initialProfile.tags||[],protectionItems:initialProfile.protectionItems||DEFAULT_PROTECTION_ITEMS,attributes:initialProfile.attributes||{}});
  const [tagInput,setTagInput]=useState(""),[saved,setSaved]=useState(true),[preview,setPreview]=useState<string|null>(null);
  const [assets,setAssets]=useState<Record<string,LocalAsset>>(()=>Object.fromEntries([
    ...ASSET_FIELDS.map(field=>[field.key,{url:p.assets[field.key],name:p.assets[field.key]?"已保存素材":undefined,status:p.assets[field.key]?"saved":"idle"}]),
    ["otherMaterial",{url:p.assets.otherMaterialImages?.[0],name:p.assets.otherMaterialImages?.[0]?"其他素材":undefined,status:p.assets.otherMaterialImages?.[0]?"saved":"idle"}],
  ]));
  const changeProfile=(patch:Partial<ProductProfile>)=>{setProfile(value=>({...value,...patch}));setSaved(false)};
  const changeAttribute=(key:keyof ProductAttributes,value:string)=>{changeProfile({attributes:{...profile.attributes,[key]:value}})};
  const checks=useMemo(()=>[
    {label:"基础信息完整",ok:Boolean(sku.trim()&&name.trim()&&type)},
    {label:"服装主图完整",ok:Boolean(assets.garmentImage?.url)},
    {label:"细节素材完整",ok:Boolean(assets.productDetailImage?.url||assets.fabricTextureImage?.url)},
    {label:"关键属性完整",ok:Object.values(profile.attributes||{}).filter(Boolean).length>=4},
    {label:"细节描述完整",ok:Boolean(profile.detailDescription?.trim())},
    {label:"标签信息完整",ok:Boolean(profile.tags?.length)},
  ],[sku,name,type,assets,profile.attributes,profile.detailDescription,profile.tags]);
  const completeness=Math.round(checks.filter(item=>item.ok).length/checks.length*100);
  const previewImages=Object.values(assets).flatMap(asset=>asset.url?[asset.url]:[]);

  async function saveAsset(asset:LocalAsset,key:keyof ProjectAssets,fileName:string,index?:number){
    const stateKey=key==="otherMaterialImages"?"otherMaterial":key;setAssets(value=>({...value,[stateKey]:{...asset,status:"uploading"}}));
    try{const url=await persistAsset(asset.file,key,fileName,index);setAssets(value=>({...value,[stateKey]:{...asset,url,file:undefined,status:"saved"}}));setSaved(false)}
    catch(error){setAssets(value=>({...value,[stateKey]:{...asset,status:"failed",error:error instanceof Error?error.message:"上传失败"}}));throw error}
  }
  async function removeAsset(key:keyof ProjectAssets,index?:number){await deleteAsset(key,index);const stateKey=key==="otherMaterialImages"?"otherMaterial":key;setAssets(value=>({...value,[stateKey]:{status:"idle"}}));setSaved(false)}
  async function clearAllAssets(){await clearSourceAssets();setAssets(Object.fromEntries([...ASSET_FIELDS.map(field=>[field.key,{status:"idle"}]),["otherMaterial",{status:"idle"}]]));setPreview(null)}
  function addTag(){const tag=tagInput.trim();if(!tag||profile.tags?.includes(tag))return;changeProfile({tags:[...(profile.tags||[]),tag]});setTagInput("")}
  async function persist(advance=false){
    const next=await saveProject({sku:sku.trim(),productName:name.trim(),productType:type,profile,...(advance?{currentStep:Math.max(2,p.currentStep),status:p.status==="未开始"?"进行中":p.status,stepStatuses:{...p.stepStatuses,"1":"confirmed","2":"ready"}}:{})});
    setSku(next.sku);setName(next.productName);setProfile(next.profile||profile);setSaved(true);if(advance)onNext();
  }
  const scrollTo=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});
  const successful=jobs.filter(job=>job.status==="success"||job.status==="confirmed"||job.status==="needs_review").length;

  return <div className="product-details-page">
    <nav className="product-tabs" aria-label="商品资料分区">{[["product-basic","基础信息"],["product-attributes","商品属性"],["product-assets","图片素材"],["product-description","细节要求"],["product-tags","标签与备注"]].map(([id,label])=><button type="button" key={id} onClick={()=>scrollTo(id)}>{label}</button>)}</nav>
    {!saved&&<div className="product-unsaved">商品资料有未保存修改，请完成后点击保存。</div>}
    <div className="product-details-top">
      <section className="card" id="product-basic"><div className="panel-head"><h2>基础信息</h2><span className={`badge ${profile.reviewStatus==="confirmed"?"success":"wait"}`}>{profile.reviewStatus==="confirmed"?"已确认":profile.reviewStatus==="awaiting_review"?"等待人工确认":"草稿"}</span></div>
        <div className="product-basic-grid"><label className="field">SKU编号 *<input value={sku} onChange={e=>{setSku(e.target.value);setSaved(false)}}/></label><label className="field">商品名称 *<input value={name} onChange={e=>{setName(e.target.value);setSaved(false)}}/></label><label className="field">商品类型 *<select value={type} onChange={e=>{setType(e.target.value as ProductType);setSaved(false)}}>{TYPES.map(item=><option key={item}>{item}</option>)}</select></label><label className="field">商品主颜色<input value={profile.attributes?.mainColor||""} onChange={e=>changeAttribute("mainColor",e.target.value)} placeholder="例如：米白色"/></label><label className="field">项目优先级<select value={profile.priority||"normal"} onChange={e=>changeProfile({priority:e.target.value as ProductProfile["priority"]})}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="urgent">紧急</option></select></label><label className="field">交付日期<input type="date" value={profile.deliveryDate||""} onChange={e=>changeProfile({deliveryDate:e.target.value})}/></label><label className="field">品牌<input value={profile.brand||""} onChange={e=>changeProfile({brand:e.target.value})} placeholder="输入品牌"/></label><label className="field">季节<select value={profile.season||""} onChange={e=>changeProfile({season:e.target.value})}><option value="">请选择</option>{["春季","夏季","秋季","冬季","四季"].map(item=><option key={item}>{item}</option>)}</select></label><label className="field">上市日期<input type="date" value={profile.listingDate||""} onChange={e=>changeProfile({listingDate:e.target.value})}/></label><label className="field">设计师／负责人<input value={profile.owner||""} onChange={e=>changeProfile({owner:e.target.value})} placeholder="负责人姓名"/></label><label className="field">资料状态<select value={profile.reviewStatus||"draft"} onChange={e=>changeProfile({reviewStatus:e.target.value as ProductProfile["reviewStatus"]})}><option value="draft">草稿</option><option value="awaiting_review">等待人工确认</option><option value="confirmed">已确认</option></select></label></div>
        <label className="field">备注<textarea maxLength={300} value={profile.notes||""} onChange={e=>changeProfile({notes:e.target.value})} placeholder="输入商品资料备注"/><span className="field-count">{profile.notes?.length||0}/300</span></label>
        <div className="product-save-actions"><button className="secondary" type="button" disabled={busy||saved} onClick={()=>run(()=>persist(false))}>保存资料</button><button className="primary" type="button" disabled={busy||!sku.trim()||!name.trim()||!assets.garmentImage?.url} onClick={()=>run(()=>persist(true))}>保存并进入换装</button></div>
      </section>
      <section className="card product-assets" id="product-assets"><div className="panel-head"><h2>图片素材</h2><div className="panel-actions"><span>{previewImages.length} 张已保存</span><ClearAssetsButton disabled={busy||!hasClearableSourceAssets(p)} onConfirm={clearAllAssets}/></div></div><div className="product-assets-grid">{ASSET_FIELDS.map(field=><div className="product-asset-card" key={field.key}><AssetUploadCard label={`${field.label}${field.required?" *":""}`} description={field.description} value={assets[field.key]||{status:"idle"}} onChange={asset=>run(()=>saveAsset(asset,field.key,field.name))} onDelete={assets[field.key]?.url?()=>run(()=>removeAsset(field.key)):undefined} onPreview={()=>assets[field.key]?.url&&setPreview(assets[field.key].url!)}/></div>)}<div className="product-asset-card"><AssetUploadCard label="其他素材" description="可补充包装、配饰或说明图" value={assets.otherMaterial||{status:"idle"}} onChange={asset=>run(()=>saveAsset(asset,"otherMaterialImages","other-material-01",0))} onDelete={assets.otherMaterial?.url?()=>run(()=>removeAsset("otherMaterialImages",0)):undefined} onPreview={()=>assets.otherMaterial?.url&&setPreview(assets.otherMaterial.url!)}/></div></div><p className="product-hint">平铺图和模特参考图用于换装；细节图与面料图用于帮助模型保护商品结构和纹理。</p></section>
      <aside className="card product-check"><div className="panel-head"><h2>资料检查与建议</h2><span className="badge">{completeness}%</span></div><div className="completeness-ring" style={{"--complete":`${completeness*3.6}deg`} as React.CSSProperties}><strong>{completeness}%</strong><small>资料完整度</small></div><div className="check-list">{checks.map(item=><div className={item.ok?"ok":"missing"} key={item.label}><span>{item.ok?"✓":"!"}</span>{item.label}</div>)}</div><div className="suggestion-box"><b>当前建议</b><p>{checks.every(item=>item.ok)?"商品资料完整，可以进入换装。":checks.filter(item=>!item.ok).map(item=>item.label.replace("完整","")).join("、")+"仍需补充。"}</p></div><small className="truth-note">这里是基于真实已保存资料的规则检查，不会冒充AI识别结果。</small></aside>
    </div>
    <div className="product-details-bottom">
      <section className="card" id="product-attributes"><div className="panel-head"><h2>服装结构</h2><small>自动进入换装提示词和人工复核</small></div><div className="attribute-grid">{(Object.keys(ATTRIBUTE_LABELS) as (keyof ProductAttributes)[]).map(key=><label className="field" key={key}>{ATTRIBUTE_LABELS[key]}<select value={profile.attributes?.[key]||""} onChange={e=>changeAttribute(key,e.target.value)}><option value="">请选择</option>{ATTRIBUTE_OPTIONS[key].map(item=><option key={item}>{item}</option>)}</select></label>)}</div><h3 className="section-label">重点保护</h3><div className="protection-grid">{DEFAULT_PROTECTION_ITEMS.map(item=><label className="check-item" key={item}><input type="checkbox" checked={(profile.protectionItems||[]).includes(item)} onChange={()=>changeProfile({protectionItems:(profile.protectionItems||[]).includes(item)?(profile.protectionItems||[]).filter(value=>value!==item):[...(profile.protectionItems||[]),item]})}/>{item}</label>)}</div></section>
      <section className="card" id="product-description"><div className="panel-head"><h2>细节描述</h2><small>给生成模型的重点提示</small></div><label className="field"><textarea maxLength={800} value={profile.detailDescription||""} onChange={e=>changeProfile({detailDescription:e.target.value})} placeholder="描述服装颜色、版型、领口、袖口、下摆、纽扣、印花、包边和面料等需要严格保持的细节。"/><span className="field-count">{profile.detailDescription?.length||0}/800</span></label></section>
      <section className="card" id="product-tags"><div className="panel-head"><h2>标签管理</h2><small>方便检索和复核</small></div><div className="tag-list">{profile.tags?.map(tag=><button type="button" key={tag} onClick={()=>changeProfile({tags:profile.tags?.filter(item=>item!==tag)})}>{tag} ×</button>)}</div><div className="tag-add"><input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addTag()}}} placeholder="输入标签"/><button type="button" className="secondary" onClick={addTag}>添加</button></div></section>
      <section className="card product-stats"><div className="panel-head"><h2>任务统计</h2><small>真实任务数据</small></div><dl><div><dt>历史生成任务</dt><dd>{jobs.length}</dd></div><div><dt>成功／待审核</dt><dd>{successful}</dd></div><div><dt>创建时间</dt><dd>{new Date(p.createdAt).toLocaleString("zh-CN")}</dd></div><div><dt>最后更新</dt><dd>{new Date(p.updatedAt).toLocaleString("zh-CN")}</dd></div></dl></section>
    </div>
    {preview&&<ImagePreviewDialog images={previewImages} index={Math.max(0,previewImages.indexOf(preview))} onClose={()=>setPreview(null)}/>}
  </div>;
}
