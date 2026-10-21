import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {collectSignals,meaningfulProgress,rankRecommendations,createRecommendationService,registerRecommendations} from '../src/recommendations.js';
import {publicSettingsRows} from '../src/ratings.js';

const now=new Date('2026-10-21T03:00:00Z');
function fixture(){
  const settings=new Map<string,string>();let historyQueries=0,calls=0;
  const sources=[{key:'a',name:'A'},{key:'b',name:'B'},{key:'private',name:'Private'}];
  const movies=[{id:'sci',sourceKey:'a',title:'星际种子',year:2020,category:'科幻片',visible:true},{id:'comedy',sourceKey:'b',title:'喜剧种子',year:2020,category:'喜剧片',visible:true},{id:'hidden',sourceKey:'a',title:'Hidden',visible:false}];
  const history=[{userId:1,sourceKey:'a',videoId:'sci',title:'星际种子',progress:1200,duration:1800,updatedAt:now},{userId:1,sourceKey:'private',videoId:'secret',title:'Restricted title',progress:1200,duration:1800,updatedAt:now},{userId:1,sourceKey:'a',videoId:'hidden',title:'Hidden',progress:1200,duration:1800,updatedAt:now}];
  const favorites=[{userId:2,sourceKey:'b',videoId:'comedy',title:'喜剧种子',createdAt:now}];
  const db:any={setting:{findUnique:async({where}:any)=>settings.has(where.key)?{key:where.key,value:settings.get(where.key)}:null,findMany:async()=>[{key:'rating:enabled',value:'true'},{key:'rating:token',value:'test-secret'}],upsert:async({where,create,update}:any)=>{const value=settings.has(where.key)?update.value:create.value;settings.set(where.key,value);return {key:where.key,value}}},source:{findMany:async()=>sources},watchHistory:{findMany:async({where}:any)=>{historyQueries++;assert.ok(where.userId);return history.filter(x=>x.userId===where.userId&&where.sourceKey.in.includes(x.sourceKey))}},favorite:{findMany:async({where}:any)=>favorites.filter(x=>x.userId===where.userId&&where.sourceKey.in.includes(x.sourceKey))},video:{findMany:async({where}:any)=>movies.filter(x=>where.sourceKey.in.includes(x.sourceKey)&&(where.visible===false?x.visible===false:where.id?.in.includes(x.id)))}};
  const make=(id:number,title:string,genre:number)=>({id,title,media_type:'movie',release_date:'2020-01-01',vote_average:8,vote_count:1000,genre_ids:[genre],overview:'A fixed test fixture',poster_path:'/fixture.jpg'});
  const science=Array.from({length:12},(_,i)=>make(100+i,'科幻作品'+i,878)),comedy=Array.from({length:12},(_,i)=>make(200+i,'喜剧作品'+i,35));
  const request:any=async(url:string,options:any)=>{calls++;assert.ok(!url.includes('test-secret'));assert.equal(options.headers.Authorization,'Bearer test-secret');const u=new URL(url);if(u.pathname.endsWith('/search/multi')){const title=u.searchParams.get('query');return Response.json({results:title==='星际种子'?[make(10,'星际种子',878)]:title==='喜剧种子'?[make(20,'喜剧种子',35)]:[]})}const rows=u.pathname.endsWith('/10/recommendations')||u.searchParams.get('with_genres')==='878'?science:u.pathname.endsWith('/20/recommendations')||u.searchParams.get('with_genres')==='35'?comedy:[...science,...comedy];return Response.json({results:u.pathname.includes('/tv')?[]:rows,total_pages:3,total_results:60})};
  return {db,settings,history,favorites,request,auth:{canSource:(user:any,key:string)=>key===(user.id===1?'a':'b')},stats:()=>({historyQueries,calls})};
}
test('recommendations ignore short previews and deduplicate episodes without manufacturing stronger taste',()=>{
  assert.equal(meaningfulProgress({progress:15,duration:1800}),false);assert.equal(meaningfulProgress({progress:300,duration:1800}),true);assert.equal(meaningfulProgress({progress:60,duration:120}),true);
  const row={videoId:'sci',title:'种子',progress:400,duration:1800,updatedAt:now};const metadata=[{id:'sci',visible:true,year:2020,category:'科幻片'}];
  const once=collectSignals([row],[],metadata,now),many=collectSignals(Array(50).fill(row),[],metadata,now);assert.equal(many.length,1);assert.equal(many[0].weight,once[0].weight);
  const both=collectSignals([row],[{...row,createdAt:now}],metadata,now);assert.equal(both[0].favorite,true);assert.equal(both[0].watched,true);assert.ok(both[0].weight>once[0].weight);
});
test('ranking enforces quality, excludes seen/dismissed/future films, and rotates stable account-specific daily exploration',()=>{
  const candidate=(id:number,extra:any={})=>({id,type:'movie' as const,title:'影片'+id,originalTitle:'',date:'2020-01-01',cover:'',desc:'',score:8,votes:1000,url:'https://www.themoviedb.org/movie/'+id,genreKeys:['scifi'],relatedTo:[],...extra});
  const rows=Array.from({length:20},(_,i)=>candidate(i+1));rows.push(candidate(25,{score:9.9,votes:1}),candidate(26,{score:6}),candidate(27,{date:'2099-01-01'}));
  const signals=[{title:'影片1',weight:1,favorite:false,at:now.toISOString()}];
  const a=rankRecommendations(rows,signals,{scifi:4},'account-a:2026-10-21',['movie:2'],10,'2026-10-21');
  assert.ok(!a.some(x=>[1,2,25,26,27].includes(x.id)));assert.ok(a.every(x=>x.reasons.some(reason=>reason.includes('科幻'))));
  assert.deepEqual(a,rankRecommendations(rows,signals,{scifi:4},'account-a:2026-10-21',['movie:2'],10,'2026-10-21'));
  const b=rankRecommendations(rows,signals,{scifi:4},'account-b:2026-10-21',['movie:2'],10,'2026-10-21');assert.notDeepEqual(a.map(x=>x.id),b.map(x=>x.id));
});
test('two accounts receive different recommendations and explanations without source-permission or daily-cache leakage',async()=>{
  const f=fixture(),service=createRecommendationService(f.db,f.auth,f.request,{});
  const a=await service.today({id:1},now),b=await service.today({id:2},now);
  assert.equal(a.analysis.topGenres[0].key,'scifi');assert.equal(b.analysis.topGenres[0].key,'comedy');assert.ok(a.items[0].title.startsWith('科幻'));assert.ok(b.items[0].title.startsWith('喜剧'));
  assert.deepEqual(a.analysis.sourceTitles.map((x:any)=>x.title),['星际种子']);assert.deepEqual(b.analysis.sourceTitles.map((x:any)=>x.title),['喜剧种子']);assert.ok(!JSON.stringify(a).includes('Restricted title'));assert.ok(!JSON.stringify(a).includes('Hidden'));assert.ok(!JSON.stringify(a).includes('test-secret'));
  const before=f.stats().calls;assert.equal((await service.today({id:1},now)).cached,true);assert.equal(f.stats().calls,before);
  assert.ok(f.settings.has('recommend:daily:1'));assert.ok(f.settings.has('recommend:daily:2'));
  assert.deepEqual(publicSettingsRows([...f.settings].map(([key,value])=>({key,value}))),[]);
  await service.dismiss(1,a.items[0].type,a.items[0].id);assert.ok(!(await service.today({id:1},now)).items.some((x:any)=>x.id===a.items[0].id));assert.equal((await service.today({id:2},now)).cached,true);
});
test('personalized lists reserve quality exploration and avoid a single media type when alternatives exist',()=>{
  const make=(id:number,type:'movie'|'tv',genre:string)=>({id,type,title:'候选'+id,originalTitle:'',date:'2020-01-01',cover:'',desc:'',score:8,votes:1000,url:'https://www.themoviedb.org/'+type+'/'+id,genreKeys:[genre],relatedTo:[]});
  const rows=[...Array.from({length:30},(_,i)=>make(i+1,'tv','scifi')),...Array.from({length:20},(_,i)=>make(i+100,'movie','comedy'))];
  const result=rankRecommendations(rows,[],{scifi:4},'account-a:2026-10-21',[],18,'2026-10-21');
  assert.equal(result.length,18);assert.ok(result.filter(x=>x.fit==='品质探索').length>=3);assert.ok(result.filter(x=>x.type==='movie').length>=4);
});
test('preferences are private per account, opt-out stops history queries, and cold starts are disclosed',async()=>{
  const f=fixture(),service=createRecommendationService(f.db,f.auth,f.request,{});
  await service.putPreferences(1,{genres:['comedy'],type:'movie',useHistory:false,useFavorites:false});const before=f.stats().historyQueries;
  const a=await service.today({id:1},now);assert.equal(f.stats().historyQueries,before);assert.equal(a.analysis.matchedTitles,0);assert.equal(a.analysis.topGenres[0].key,'comedy');assert.equal(a.analysis.coldStart,false);
  assert.deepEqual((await service.getPreferences(2)).genres,[]);
  const fresh=await service.today({id:3},now);assert.equal(fresh.analysis.coldStart,true);assert.match(fresh.analysis.summary,/没有足够/);assert.equal(fresh.analysis.sourceTitles.length,0);
  await assert.rejects(service.putPreferences(1,{genres:['unknown'],type:'both',useHistory:true,useFavorites:true}));
});
test('recommendation routes use only the authenticated account and return private responses; failures do not expose tokens',async()=>{
  const f=fixture(),app=express();app.use(express.json());const deps={...f.auth,requireUser:async(req:any,res:any)=>{const id=Number(req.headers['x-user']);if(!id){res.status(401).json({error:'login required'});return null}return {id}}};registerRecommendations(app,f.db,deps,f.request,{});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try{
    assert.equal((await fetch(base+'/api/recommendations/today')).status,401);
    const res=await fetch(base+'/api/recommendations/today?userId=1',{headers:{'x-user':'2'}});assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(res.headers.get('vary'),'Cookie');const b=await res.json();assert.equal(b.analysis.topGenres[0].key,'comedy');assert.ok(!b.analysis.sourceTitles.some((x:any)=>x.title==='星际种子'));
    assert.equal((await fetch(base+'/api/recommendations/preferences',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({})})).status,401);
    assert.equal((await fetch(base+'/api/recommendations/preferences',{method:'PUT',headers:{'Content-Type':'application/json','x-user':'2'},body:JSON.stringify({genres:['unknown'],type:'both',useHistory:true,useFavorites:true})})).status,400);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
  const broken=createRecommendationService(f.db,f.auth,async()=>{throw Error('never disclose test-secret')},{});await assert.rejects(broken.today({id:5},new Date('2026-10-22T03:00:00Z')));
});
