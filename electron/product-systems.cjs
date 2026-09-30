const PRODUCT_SYSTEMS=Object.freeze([
  Object.freeze({
    id:"cocomoda",
    name:"COCO MODA 商品系统",
    origin:"https://cocomoda.tooerp.com",
    loginUrl:"https://cocomoda.tooerp.com/#/login",
    productUrl:"https://cocomoda.tooerp.com/#/product/index",
    partition:"persist:cocomoda-product-system",
    assetOrigins:Object.freeze(["https://cocomoda.tooerp.com"]),
    resourcePrefixes:Object.freeze(["/be/statics/resources/"]),
    allowDirectImagePath:false,
  }),
  Object.freeze({
    id:"tooerp-us",
    name:"美国商品系统",
    origin:"https://us.tooerp.com",
    loginUrl:"https://us.tooerp.com/#/login",
    productUrl:"https://us.tooerp.com/#/product",
    partition:"persist:tooerp-us-product-system",
    assetOrigins:Object.freeze(["https://us.tooerp.com","https://usimg.k2049.com"]),
    resourcePrefixes:Object.freeze(["/be/statics/resources/","/files/t/","/files/x/"]),
    allowDirectImagePath:false,
  }),
]);

function productSystemById(id){return PRODUCT_SYSTEMS.find(system=>system.id===id)}
function productSearchUrl(system,sku){
  const separator=system.productUrl.includes("?")?"&":"?";
  return `${system.productUrl}${separator}productNumber=${encodeURIComponent(sku)}`;
}
function isImagePath(pathname){return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(pathname)}
function isAllowedProductImageUrl(raw,sourceId){
  try{
    const url=new URL(raw);
    return PRODUCT_SYSTEMS.some(system=>{
      if(sourceId&&system.id!==sourceId)return false;
      if(!system.assetOrigins.includes(url.origin)||!isImagePath(url.pathname))return false;
      return system.resourcePrefixes.some(prefix=>url.pathname.startsWith(prefix))||system.allowDirectImagePath;
    });
  }catch{return false}
}

module.exports={PRODUCT_SYSTEMS,productSystemById,productSearchUrl,isAllowedProductImageUrl};
