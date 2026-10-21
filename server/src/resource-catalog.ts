// Public candidate directory, shipped with the source code. Importing it never writes to the database.
// Add only reviewed HTTP(S) endpoints; never put tokens or private subscription URLs here.
export type ResourceEntry={key:string;name:string;homepage:string;api:string;description:string;tags:readonly string[]};
export const resourceCatalog:readonly ResourceEntry[]=Object.freeze([
  Object.freeze({key:'feifan',name:'非凡资源',homepage:'https://ffzy5.tv/',api:'https://api.ffzyapi.com/api.php/provide/vod/',description:'综合影视接口，覆盖电影、电视剧、动漫、综艺和短剧。公开目录不代表已取得影片播放授权。',tags:Object.freeze(['综合影视','JSON','M3U8'])})
]);

export function canonicalResourceApi(value:string){
  try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return '';url.hash='';url.pathname=url.pathname.replace(/\/+$/,'');return url.toString();}catch{return '';}
}
