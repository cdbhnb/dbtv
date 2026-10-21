import type {Express} from 'express';
import {resourceCatalog,canonicalResourceApi,type ResourceEntry} from './resource-catalog.js';

export function resourceSource(entry:ResourceEntry,rows:any[]){
  const api=canonicalResourceApi(entry.api);
  const matches=rows.filter(row=>row.type==='tvbox-json'&&canonicalResourceApi(row.api)===api);
  // Prefer the catalog key; never silently adopt two separate configured sources.
  if(matches.length>1)throw Object.assign(Error('存在重复接口，请先在源配置中确认'),{status:409});
  const collision=rows.find(row=>row.key===entry.key);
  if(collision&&!matches.includes(collision))throw Object.assign(Error('资源标识已被其他接口使用，未覆盖原配置'),{status:409});
  return matches[0]||null;
}

export function registerResourceCenter(app:Express,db:any,deps:{requireAdmin:any;inspect:(entry:any)=>Promise<any>;invalidate:()=>void}){
  const prefix='/api/admin/resource-center';
  app.use(prefix,async(req,res,next)=>{if(await deps.requireAdmin(req,res))next();});
  app.get(prefix,async(_req,res)=>{
    const sources=await db.source.findMany({select:{key:true,type:true,api:true,enabled:true}});
    const items=resourceCatalog.map(entry=>{
      try{const source=resourceSource(entry,sources);return {...entry,published:!!source?.enabled,sourceKey:source?.key||null,conflict:null};}
      catch(error:any){return {...entry,published:false,sourceKey:null,conflict:error.message};}
    });
    res.json({storage:'source-file',items});
  });
  app.post(prefix+'/:key/check',async(req,res)=>{
    const entry=resourceCatalog.find(item=>item.key===req.params.key);
    if(!entry)return res.status(404).json({error:'目录中没有这个资源站'});
    const start=Date.now();
    try{
      const result=await deps.inspect({...entry,type:'tvbox-json'});
      if(!Array.isArray(result.list)||!result.list.length&&!Array.isArray(result.raw?.class))throw Error('没有返回可识别的影片或分类数据');
      res.json({ok:true,total:result.total,latencyMs:Date.now()-start,checkedAt:new Date().toISOString(),message:'接口可读取；此检测不代表全部影片都可播放。'});
    }catch{res.status(502).json({error:'接口暂不可用或返回格式不兼容，未加入数据源'});}
  });
  app.put(prefix+'/:key/publication',async(req,res)=>{
    const entry=resourceCatalog.find(item=>item.key===req.params.key);
    if(!entry)return res.status(404).json({error:'目录中没有这个资源站'});
    if(!req.body||typeof req.body.published!=='boolean'||Object.keys(req.body).some(key=>key!=='published'))return res.status(400).json({error:'只能提交布尔类型的 published 上架状态'});
    try{
      const source=await db.$transaction(async(tx:any)=>{
        const rows=await tx.source.findMany({select:{key:true,type:true,api:true,enabled:true}});
        const existing=resourceSource(entry,rows);
        if(existing){if(existing.enabled===req.body.published)return existing;return tx.source.update({where:{key:existing.key},data:{enabled:req.body.published}});}
        // Listing, checking and unpublishing an uninstalled candidate must never create a Source row.
        if(!req.body.published)return null;
        return tx.source.create({data:{key:entry.key,name:entry.name,type:'tvbox-json',api:entry.api,enabled:true,searchable:true,quickSearch:true,filterable:true}});
      });
      deps.invalidate();
      res.json({ok:true,published:!!source?.enabled,sourceKey:source?.key||null,message:req.body.published?'已上架；会员观看范围仍按原授权设置。':'已下架；已采集内容、分类绑定和会员授权均保留。'});
    }catch(error:any){res.status(error.status||409).json({error:error.status?error.message:'上架状态保存失败，请刷新后重试；未覆盖其他源配置'});}
  });
}
