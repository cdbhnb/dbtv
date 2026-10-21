import type {Express} from 'express';

export type CategoryRule={sourceKey:string;name:string;id?:string};
export type ContentRules={deniedSourceKeys:string[];deniedCategories:CategoryRule[];sourceSelection?:'grade'};
export function readCategoryRules(raw:any):CategoryRule[]{try{const value=typeof raw==='string'?JSON.parse(raw):raw;return Array.isArray(value)?value:[]}catch{return []}}
export function readContentRules(raw:any):ContentRules{
  try{const value=typeof raw==='string'?JSON.parse(raw):raw;return {deniedSourceKeys:Array.isArray(value?.deniedSourceKeys)?value.deniedSourceKeys:[],deniedCategories:Array.isArray(value?.deniedCategories)?value.deniedCategories:[],...value?.sourceSelection==='grade'?{sourceSelection:'grade' as const}:{}}}catch{return {deniedSourceKeys:[],deniedCategories:[]}}
}
export function validateContentRules(raw:any):ContentRules{
  if(raw?.sourceSelection!==undefined&&raw.sourceSelection!=='grade')throw Error('源选择模式无效');
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.deniedSourceKeys)||raw.deniedSourceKeys.length>500||raw.deniedSourceKeys.some((key:any)=>typeof key!=='string'||!key||key.length>191)||!Array.isArray(raw.deniedCategories)||raw.deniedCategories.length>100)throw Error('内容限制格式无效');
  const deniedCategories=raw.deniedCategories.map((rule:any)=>{
    if(!rule||typeof rule.sourceKey!=='string'||!rule.sourceKey||rule.sourceKey.length>191||typeof rule.name!=='string'||!rule.name.trim()||rule.name.length>100||rule.id!==undefined&&(typeof rule.id!=='string'||rule.id.length>191)||rule.sourceKey==='*'&&rule.id)throw Error('分类规则无效');
    return {sourceKey:rule.sourceKey,name:rule.name.trim(),...rule.id?{id:rule.id}:{}};
  });return {deniedSourceKeys:[...new Set<string>(raw.deniedSourceKeys)],deniedCategories,...raw.sourceSelection==='grade'?{sourceSelection:'grade' as const}:{}};
}
export const categoryKey=(raw:any)=>String(raw||'').normalize('NFKC').replace(/倫理/g,'伦理').replace(/[\s\-_·/\\,，、:：()（）【】\[\]]/g,'').toLowerCase().replace(/(?:片|类|分类)$/,'');
export function categoryDenied(rules:ContentRules,sourceKey:string,item:any,classes:any[]=[]){
  const scoped=rules.deniedCategories.filter(rule=>rule.sourceKey==='*'||rule.sourceKey===sourceKey);
  if(!scoped.length)return false;
  const names=[item.originalCategory,item.type_name,item.category,item.vod_class,item.name].filter(Boolean).flatMap(x=>String(x).split(/[,，、/]/)).map(categoryKey);
  const ids=new Set([item.typeId,item.type_id,item.parentTypeId,item.type_pid].filter(Boolean).map(String));
  for(const row of classes)if(names.includes(categoryKey(row.name)))ids.add(String(row.id));
  for(let n=0;n<classes.length;n++){let changed=false;for(const row of classes)if(ids.has(String(row.id))&&row.parent&&!ids.has(String(row.parent))){ids.add(String(row.parent));changed=true}if(!changed)break;}
  for(const row of classes)if(ids.has(String(row.id)))names.push(categoryKey(row.name));
  return scoped.some(rule=>rule.id&&rule.sourceKey!=='*'?ids.has(rule.id):names.some(name=>name.includes(categoryKey(rule.name))));
}

export function createContentPolicy(db:any,deps:{canSource:(user:any,key:string)=>boolean;remoteDetail:(source:any,id:string)=>Promise<any>;categories:(source:any)=>Promise<any[]>}){
  async function allowed(user:any,sourceKey:string,id:string,item?:any){
    if(user.role==='admin')return true;
    if(!deps.canSource(user,sourceKey))return false;
    const source=await db.source.findUnique({where:{key:sourceKey}});if(!source?.enabled)return false;
    const rules=readContentRules(user.contentRules);
    const scope:CategoryRule[]=user.sourceScopes?.[sourceKey]||[];
    if(rules.deniedSourceKeys.includes(sourceKey))return false;
    if(!scope.length&&!rules.deniedCategories.some(rule=>rule.sourceKey==='*'||rule.sourceKey===sourceKey))return true;
    try{
      const local=id?await db.video.findUnique({where:{id}}):null;
      if(local&&(!local.visible||local.sourceKey!==sourceKey))return false;
      // Use trusted server/upstream metadata, never fields supplied by a browser.
      // Old collected records may have lost their original remote category during mapping.
      const raw=local&&(source.type==='local'||local.originalCategory)?local:id?await deps.remoteDetail(source,id):item;
      if(!raw)return false;
      if(![raw.originalCategory,raw.category,raw.type_name,raw.vod_class,raw.type_id,raw.typeId].some(Boolean))return false;
      const classes=source.type==='local'?[]:await deps.categories(source);
      return !categoryDenied(rules,sourceKey,raw,classes)&&(!scope.length||categoryDenied({deniedSourceKeys:[],deniedCategories:scope},sourceKey,raw,classes));
    }catch{return false;} // Unknown classification must not bypass an active restriction.
  }
  return {allowed};
}

// One response boundary also covers older list/detail routes and cached search variants.
export function registerContentPolicy(app:Express,policy:ReturnType<typeof createContentPolicy>,deps:{requireUser:any;categories:any;db:any}){
  app.use('/api',async(req:any,res:any,next:any)=>{
    const path=req.originalUrl.split('?')[0];
    if(!/^\/api\/(sources|library|search|playback-options|discover|favorites|history|danmaku|playback-errors|profile)(\/|$)/i.test(path))return next();
    const user=await deps.requireUser(req,res);if(!user)return;
    if(user.role==='admin')return next();
    const rules=readContentRules(user.contentRules),memo=new Map<string,Promise<boolean>>();
    const check=(sourceKey:string,id:string,item?:any)=>{const key=JSON.stringify([sourceKey,id]);if(!memo.has(key))memo.set(key,policy.allowed(user,sourceKey,id,item));return memo.get(key)!};
    if(['POST','PUT'].includes(req.method)&&req.body?.sourceKey&&req.body?.videoId&&!await check(String(req.body.sourceKey),String(req.body.videoId)))return res.status(403).json({error:'当前会员不能访问此源或分类',code:'CONTENT_RESTRICTED'});
    const original=res.json.bind(res);
    const routeSource=path.match(/^\/api\/sources\/([^/]+)/i)?.[1];
    const sourceKey=routeSource?decodeURIComponent(routeSource):'';
    let classes:any[]=[];
    const scope:CategoryRule[]=user.sourceScopes?.[sourceKey]||[];
    if(sourceKey&&(rules.deniedCategories.length||scope.length)){try{const source=await deps.db.source.findUnique({where:{key:sourceKey}});if(source&&source.type!=='local')classes=await deps.categories(source)}catch{}}
    const categoryVisible=(row:any)=>!categoryDenied(rules,sourceKey,row,classes)&&(!scope.length||categoryDenied({deniedSourceKeys:[],deniedCategories:scope},sourceKey,row,classes));
    async function project(value:any):Promise<any>{
      if(Array.isArray(value)){
        const filtered=[];for(const row of value){
          if(typeof row==='string'&&/\/(categories|category-options)$/.test(path)&&!categoryVisible({category:row}))continue;
          const result=await project(row);if(result!==null)filtered.push(result);
        }return filtered;
      }
      if(!value||typeof value!=='object'||value instanceof Date)return value;
      // Global simulated comments are server-generated decoration, not a source grant.
      const globalComment=value.simulated===true&&value.episodeId==='global'&&value.sourceKey==='simulated';
      if(!globalComment&&value.sourceKey&&(value.videoId||value.title&&value.id)&&!await check(String(value.sourceKey),String(value.videoId||value.id),value))return null;
      // Source lists have key/name; never leak disabled or explicitly denied sources.
      if(value.key&&value.name&&rules.deniedSourceKeys.includes(value.key))return null;
      if(/\/library\/categories$/.test(path)&&value.name&&categoryDenied(rules,'*',{category:value.name}))return null;
      const result={...value};
      for(const key of ['items','variants','categories','recent'])if(Array.isArray(value[key])){
        result[key]=key==='categories'?value[key].filter((row:any)=>categoryVisible({category:row.name,typeId:row.id,parentTypeId:row.parent})):await project(value[key]);
      }
      return result;
    }
    res.json=(body:any)=>{
      if(res.statusCode>=400)return original(body);
      void project(body).then(result=>{if(result===null){res.status(403);original({error:'当前会员不能访问此源或分类',code:'CONTENT_RESTRICTED'})}else original(result)}).catch(()=>{if(!res.headersSent){res.status(503);original({error:'内容权限校验暂时不可用'})}});return res;
    };
    next();
  });
}
