import type {Express} from 'express';
import type {PrismaClient} from '@prisma/client';
import {readPagination,createMergedPagination,remoteHasMore} from './pagination.js';

type Category = {id:string; parent:string; name:string};
const text=(value:unknown)=>String(value||'').trim();
const aliases:Record<string,string>={'动作':'动作片','喜剧':'喜剧片','爱情':'爱情片','科幻':'科幻片','恐怖':'恐怖片','剧情':'剧情片','战争':'战争片','悬疑':'悬疑片','犯罪':'犯罪片','动画':'动画片','国漫':'国产动漫','国产动画':'国产动漫','记录片':'纪录片'};
export function belongs(name:string,group:string){
  name=aliases[name]||name;
  if(group==='动漫')return /动漫|动画|番剧|少儿|国漫/.test(name);
  if(group==='电视剧')return /连续剧|电视剧|国产剧|内地剧|大陆剧|港剧|香港剧|台剧|台湾剧|欧美剧|日韩剧|韩剧|日剧|日本剧|海外剧|泰剧|泰国剧|马泰剧/.test(name);
  if(group==='电影')return /电影|片$/.test(name)&&! /综艺|伦理|预告|福利/.test(name);
  if(group==='综艺')return /综艺|真人秀|脱口秀|演唱会|音乐节目/.test(name);
  if(group==='纪录片')return /纪录|记录/.test(name);
  if(group==='短剧')return /短剧|微剧|现代都市|古装仙侠|穿越|年代|重生|反转|总裁|恋爱|脑洞|赘婿|战神/.test(name);
  if(group==='体育')return /体育|赛事|篮球|足球|网球|台球|斯诺克|电竞|LPL|NBA|CBA/i.test(name);
  return name===group;
}
export function matchCategories(categories:Category[],group:string){
  const ids=new Set(categories.filter(x=>belongs(x.name,group)).map(x=>x.id));
  for(let i=0;i<categories.length;i++)for(const x of categories)if(ids.has(x.parent))ids.add(x.id);
  return categories.filter(x=>ids.has(x.id));
}
export const regions=['大陆','香港','台湾','美国','韩国','日本','印度','英国','法国','加拿大','西班牙','德国','俄罗斯','意大利','泰国','新加坡','马来西亚'];
export const languages=['国语','英语','粤语','西班牙语','韩语','日语','法语','俄语','意大利语','德语','印地语','泰语'];
function normalized(value:string){return value.replace(/中国大陆|中国内地|内地/g,'大陆').replace(/中国香港/g,'香港').replace(/中国台湾/g,'台湾').replace(/汉语普通话|普通话|汉语|中文/g,'国语').replace(/韩语|韩国语/g,'韩语').replace(/日本语/g,'日语');}
export function matchesFilters(item:any,filters:{area?:string;year?:string;language?:string}){
  return (!filters.area||normalized(text(item.area??item.vod_area)).includes(filters.area))&&
    (!filters.year||text(item.year??item.vod_year)===filters.year)&&
    (!filters.language||normalized(text(item.language??item.vod_lang)).includes(filters.language));
}
export function xmlCategories(xml:string):Category[]{
  const block=xml.match(/<class[^>]*>([\s\S]*?)<\/class>/i)?.[1]||'';
  return [...block.matchAll(/<ty\b([^>]*)>([\s\S]*?)<\/ty>/gi)].map(m=>({id:m[1].match(/\bid=["']([^"']+)/i)?.[1]||'',parent:m[1].match(/\bpid=["']([^"']+)/i)?.[1]||'0',name:m[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').trim()})).filter(x=>x.id&&x.name);
}

export function registerBrowse(app:Express,db:PrismaClient,deps:{fetchText:(url:string,timeout?:number)=>Promise<string>;parseRemote:(value:string)=>any;publicVideo:(source:any,video:any)=>any}){
  const cache=new Map<string,{expires:number;value:Category[]}>();
  const pageCache=new Map<string,{expires:number;value:any}>();
  const pending=new Map<string,Promise<any>>();
  const merged=createMergedPagination();
  async function readPage(url:string){
    const hit=pageCache.get(url);if(hit&&hit.expires>Date.now())return hit.value;
    if(pending.has(url))return pending.get(url)!;
    const task=deps.fetchText(url,12000).then(body=>{
      const result=deps.parseRemote(body),raw=result.raw||{};
      const limit=Number(raw.limit||raw.pagesize||body.match(/pagesize=["'](\d+)/i)?.[1]||result.list.length||12);
      const value={...result,limit};
      if(pageCache.size>=100)pageCache.delete(pageCache.keys().next().value!);
      pageCache.set(url,{expires:Date.now()+120000,value});return value;
    }).finally(()=>pending.delete(url));pending.set(url,task);return task;
  }
  async function categories(source:any):Promise<Category[]>{
    const hit=cache.get(source.key);if(hit&&hit.expires>Date.now())return hit.value;
    const url=new URL(source.api);url.searchParams.set('ac','list');url.searchParams.set('pagesize','1');
    const body=await deps.fetchText(url.toString());let rows:Category[]=[];
    if(body.trimStart().startsWith('<'))rows=xmlCategories(body);
    else {const raw=JSON.parse(body);rows=(raw.class||raw.data?.class||[]).map((x:any)=>({id:text(x.type_id),parent:text(x.type_pid),name:text(x.type_name)})).filter((x:Category)=>x.id&&x.name);}
    if(cache.size>100)cache.clear();cache.set(source.key,{expires:Date.now()+600000,value:rows});return rows;
  }
  app.get('/api/sources/:key/browse-options',async(req,res)=>{
    const source=await db.source.findUnique({where:{key:String(req.params.key)}});if(!source)return res.status(404).json({error:'源不存在'});
    const group=text(req.query.group)||'电影';
    const local=await db.video.findMany({where:{sourceKey:source.key,visible:true},distinct:['category'],select:{category:true}});
    let rows=local.length?local.map(x=>({id:x.category||'',name:x.category||'',parent:'0'})):await categories(source);
    const bindings=await db.categoryBinding.findMany({where:{sourceKey:source.key,enabled:true}});
    rows=matchCategories(rows,group);
    // Saved bindings can also place a nonstandard source category under a main category.
    const all=local.length?local.map(x=>({id:x.category||'',name:x.category||'',parent:'0'})):await categories(source);
    for(const row of all)if(bindings.some(b=>b.remoteCategory===row.name&&belongs(b.localCategory,group))&&!rows.some(x=>x.id===row.id))rows.push(row);
    const subcategories=rows.filter(x=>x.name!==group&&x.name!=='连续剧');
    res.json({categories:subcategories,areas:regions,languages,years:Array.from({length:new Date().getFullYear()-1999},(_,i)=>String(new Date().getFullYear()-i))});
  });
  app.get('/api/sources/:key/browse',async(req,res)=>{
    const source=await db.source.findUnique({where:{key:String(req.params.key)}});if(!source)return res.status(404).json({error:'源不存在'});
    let paging;try{paging=readPagination(req.query as Record<string,unknown>)}catch(error:any){return res.status(400).json({error:error.message})}
    const {page,pageSize}=paging,group=text(req.query.group)||'电影',sub=text(req.query.sub);
    const filters={area:text(req.query.area),year:text(req.query.year),language:text(req.query.language)};
    const localCount=await db.video.count({where:{sourceKey:source.key,visible:true}});
    if(localCount){
      const all=await db.video.findMany({where:{sourceKey:source.key,visible:true},select:{category:true},distinct:['category']});
      const allowed=all.map(x=>x.category).filter((x):x is string=>!!x&&belongs(x,group));
      if(sub&&!allowed.includes(sub))return res.status(400).json({error:'该子分类不属于当前分类'});
      // Apply aliases to metadata before counting, so 国语 also matches 汉语普通话.
      const candidates=await db.video.findMany({where:{sourceKey:source.key,visible:true,category:{in:sub?[sub]:allowed}},orderBy:[{updatedAt:'desc'},{id:'asc'}]});
      const filtered=candidates.filter(x=>matchesFilters(x,filters));
      return res.json({items:filtered.slice((page-1)*pageSize,page*pageSize),total:filtered.length,hasMore:page*pageSize<filtered.length,page,pageSize,local:true});
    }
    const all=await categories(source),matched=matchCategories(all,group);
    const bindings=await db.categoryBinding.findMany({where:{sourceKey:source.key,enabled:true}});
    for(const x of all)if(bindings.some(b=>b.remoteCategory===x.name&&belongs(b.localCategory,group))&&!matched.some(c=>c.id===x.id))matched.push(x);
    if(sub&&!matched.some(x=>x.id===sub))return res.status(400).json({error:'该子分类不属于当前分类'});
    // Keep parent buckets: some providers store titles directly in the parent.
    const targets=sub?matched.filter(x=>x.id===sub):matched;
    if(!targets.length)return res.json({items:[],page,pageSize,hasMore:false,total:0});
    try{
      const key=JSON.stringify([source.key,source.api,targets.map(row=>row.id),filters]),limits=new Map<number,number>();
      const result=await merged.get(key,targets.length,page,pageSize,async(bucket,upstreamPage)=>{
        const url=new URL(source.api);url.searchParams.set('ac','detail');url.searchParams.set('t',targets[bucket].id);url.searchParams.set('pg',String(upstreamPage));url.searchParams.set('pagesize','12');
        const data=await readPage(url.toString());let limit=limits.get(bucket);
        if(!limit){const firstUrl=new URL(url);firstUrl.searchParams.set('pg','1');limit=upstreamPage===1?data.limit:(await readPage(firstUrl.toString())).limit;limits.set(bucket,limit!);}
        return {items:data.list.map((item:any)=>deps.publicVideo(source,item)),hasMore:remoteHasMore(data,upstreamPage,limit!)};
      },item=>matchesFilters(item,filters));
      res.json({...result,local:false});
    }catch(error:any){res.status(503).json({error:/页码过深|缩小|繁忙/.test(error.message)?error.message:'远程分页读取失败，请稍后重试'})}
  });
}
