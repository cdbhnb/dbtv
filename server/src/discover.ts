import type {Express} from 'express';
import type {PrismaClient} from '@prisma/client';

type RankEntry={sourceKey:string;videoId:string;userId:number|null;at:Date};
export function countAudience(entries:RankEntry[]){
  const rows=new Map<string,{sourceKey:string;videoId:string;count:number;at:Date;users:Set<number>}>();
  for(const entry of entries){
    if(entry.userId===null)continue;
    const key=JSON.stringify([entry.sourceKey,entry.videoId]);
    let row=rows.get(key);if(!row){row={sourceKey:entry.sourceKey,videoId:entry.videoId,count:0,at:entry.at,users:new Set()};rows.set(key,row);}
    row.users.add(entry.userId);row.count=row.users.size;if(entry.at>row.at)row.at=entry.at;
  }
  return [...rows.values()].sort((a,b)=>b.count-a.count||b.at.getTime()-a.at.getTime()||a.videoId.localeCompare(b.videoId)).map(({users,...row})=>row);
}

export function registerDiscover(app:Express,db:PrismaClient,auth:{requireUser:(req:any,res:any)=>Promise<any>;canSource:(user:any,key:string)=>boolean}){
  app.get('/api/discover',async(req,res)=>{
    const user=await auth.requireUser(req,res);if(!user)return;
    const mode=req.query.mode==='favorites'?'favorites':'viewers';
    const period=['7','30','all'].includes(String(req.query.period))?String(req.query.period):'7';
    const page=Math.max(1,Math.floor(Number(req.query.page)||1)),pageSize=24;
    const sourceRows=await db.source.findMany({where:{enabled:true},select:{key:true,name:true}});
    const sources=sourceRows.filter(x=>auth.canSource(user,x.key)),sourceKeys=sources.map(x=>x.key);
    const since=period==='all'?undefined:new Date(Date.now()-Number(period)*86400000);
    const base={sourceKey:{in:sourceKeys},userId:{not:null}};
    const entries:RankEntry[]=mode==='favorites'
      ?(await db.favorite.groupBy({by:['sourceKey','videoId','userId'],where:{...base,...since?{createdAt:{gte:since}}:{}},_max:{createdAt:true}})).map(x=>({...x,at:x._max.createdAt!}))
      :(await db.watchHistory.groupBy({by:['sourceKey','videoId','userId'],where:{...base,progress:{gt:0},...since?{updatedAt:{gte:since}}:{}},_max:{updatedAt:true}})).map(x=>({...x,at:x._max.updatedAt!}));
    const ranks=countAudience(entries);
    const hidden=await db.video.findMany({where:{sourceKey:{in:sourceKeys},visible:false},select:{id:true}}),hiddenIds=new Set(hidden.map(x=>x.id));
    const visible=ranks.filter(x=>!hiddenIds.has(x.videoId));
    const selected=visible.slice((page-1)*pageSize,page*pageSize);
    const items=await Promise.all(selected.map(async(x,i)=>{
      const where={sourceKey:x.sourceKey,videoId:x.videoId};
      const record=mode==='favorites'?await db.favorite.findFirst({where,orderBy:{createdAt:'desc'},select:{title:true,cover:true}}):await db.watchHistory.findFirst({where,orderBy:{updatedAt:'desc'},select:{title:true,cover:true}});
      return {id:x.videoId,sourceKey:x.sourceKey,sourceName:sources.find(s=>s.key===x.sourceKey)?.name,title:record?.title||'未命名影片',cover:record?.cover||'',audience:x.count,rank:(page-1)*pageSize+i+1};
    }));
    res.json({items,total:visible.length,page,pageSize,hasMore:page*pageSize<visible.length,mode,period});
  });
}
