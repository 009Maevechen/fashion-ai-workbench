import type {ProductType} from "./db";

export type TryonOption={id:string;label:string};

export const TRYON_PRODUCT_TYPE_OPTIONS:ReadonlyArray<{id:string;value:ProductType;label:string}>=[
  {id:"product-top",value:"上衣",label:"上衣"},
  {id:"product-pants",value:"裤装",label:"裤装"},
  {id:"product-dress",value:"连衣裙",label:"连衣裙"},
  {id:"product-skirt",value:"半身裙",label:"半身裙"},
  {id:"product-set",value:"套装",label:"套装"},
];

export const TRYON_MODE_OPTIONS:ReadonlyArray<{id:"fast"|"standard"|"quality";label:string}>=[
  {id:"fast",label:"快速"},
  {id:"standard",label:"标准"},
  {id:"quality",label:"精细"},
];

export const TRYON_PROTECTION_OPTIONS:ReadonlyArray<TryonOption>=[
  {id:"keep-fit",label:"保持版型"},
  {id:"keep-neckline",label:"保持领口"},
  {id:"keep-cuffs",label:"保持袖口"},
  {id:"keep-shoulders",label:"保持肩部"},
  {id:"keep-hem",label:"保持下摆"},
  {id:"keep-button-count",label:"保持纽扣数量"},
  {id:"keep-print-position",label:"保持印花位置"},
  {id:"keep-white-trim",label:"保持白色包边"},
  {id:"keep-black-trim",label:"保持黑色包边"},
  {id:"keep-fabric-texture",label:"保持面料纹理"},
  {id:"keep-garment-length",label:"保持服装长度"},
  {id:"prevent-new-pockets",label:"禁止新增口袋"},
  {id:"prevent-new-belts",label:"禁止新增腰带"},
  {id:"prevent-category-change",label:"禁止改变服装类别"},
  {id:"prevent-top-to-dress",label:"禁止把上衣生成裙子"},
  {id:"prevent-length-extension",label:"禁止延长衣长"},
  {id:"keep-original-hem",label:"保持原始下摆"},
  {id:"keep-all-trim",label:"保持包边"},
  {id:"keep-print",label:"保持印花"},
];

export const TRYON_PROTECTION_LABELS=TRYON_PROTECTION_OPTIONS.map(option=>option.label);
