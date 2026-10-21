import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {catalogQuery,catalogItems,registerCatalog} from '../src/catalog.js';
import {episodeDisplayOrder} from '../../client/src/playback.js';

test('episode reversal copies only display order, preserving canonical next/previous episodes',()=>{
  const episodes=[{id:'ep2',sortOrder:2},{id:'ep1',sortOrder:1},{id:'ep3',sortOrder:3}];
  const canonical=episodeDisplayOrder(episodes),reversed=episodeDisplayOrder(canonical,true);
  assert.deepEqual(reversed.map(x=>x.id),['ep3','ep2','ep1']);assert.deepEqual(canonical.map(x=>x.id),['ep1','ep2','ep3']);assert.equal(canonical[canonical.findIndex(x=>x.id==='ep2')+1].id,'ep3');assert.equal(episodes[0].id,'ep2');assert.deepEqual(episodeDisplayOrder([],true),[]);
});
test('catalog uses global provider sorting and supported trending rather than local view counts',()=>{
  const now=new Date('2026-10-20T16:30:00Z');
  let query=catalogQuery({type:'movie',mode:'rating',page:'2',genre:'878',country:'CN',language:'zh',year:'2019'},now);
  assert.equal(query.path,'/discover/movie');assert.equal(query.params.get('sort_by'),'vote_average.desc');assert.equal(query.params.get('vote_count.gte'),'300');assert.equal(query.params.get('with_genres'),'878');assert.equal(query.params.get('with_origin_country'),'CN');assert.equal(query.params.get('primary_release_date.gte'),'2019-01-01');assert.equal(query.params.get('primary_release_date.lte'),'2019-12-31');assert.equal(query.params.get('page'),'2');
  query=catalogQuery({type:'tv',mode:'rating'},now);assert.equal(query.params.get('vote_count.gte'),'100');assert.equal(query.params.get('first_air_date.lte'),'2026-10-21');
  query=catalogQuery({type:'tv',mode:'week'},now);assert.equal(query.path,'/trending/tv/week');assert.equal(query.params.has('sort_by'),false);
  assert.throws(()=>catalogQuery({mode:'week',year:'2026'},now));assert.throws(()=>catalogQuery({mode:'rating',genre:'x&api_key=secret'},now));assert.throws(()=>catalogQuery({page:501},now));assert.throws(()=>catalogQuery({mode:'view_count'},now));
});
test('year and month ranks are release cohorts and new releases exclude future dates',()=>{
  const now=new Date('2026-01-01T00:00:00Z');
  for(const mode of ['year','month']){const query=catalogQuery({type:'tv',mode},now);assert.equal(query.params.get('first_air_date.gte'),'2026-01-01');assert.equal(query.params.get('first_air_date.lte'),'2026-01-01');assert.equal(query.params.get('sort_by'),'popularity.desc');assert.match(query.note,/不是该时段观看次数/);}
  const fresh=catalogQuery({type:'movie',mode:'new'},now);assert.equal(fresh.params.get('sort_by'),'primary_release_date.desc');assert.equal(fresh.params.get('primary_release_date.lte'),'2026-01-01');assert.equal(fresh.params.get('primary_release_date.gte'),'2025-10-03');assert.equal(fresh.params.get('vote_count.gte'),'5');
  assert.throws(()=>catalogQuery({mode:'month',year:'2020'},now));
});
test('catalog sanitizes artwork, marks unrated items and preserves provider rank order',()=>{
  const rows=catalogItems([{id:2,title:'First',vote_average:7.8,vote_count:500,poster_path:'/cover.jpg'},{id:3,title:'No votes',vote_average:0,vote_count:0,poster_path:'https://evil.test/image.jpg'},{id:4,title:'Adult',adult:true}], 'movie',2);
  assert.equal(rows.length,2);assert.equal(rows[0].rank,21);assert.equal(rows[0].cover,'https://image.tmdb.org/t/p/w342/cover.jpg');assert.equal(rows[1].score,null);assert.equal(rows[1].cover,'');assert.equal(rows[0].url,'https://www.themoviedb.org/movie/2');assert.equal('sourceKey' in rows[0],false);
});
test('catalog routes require authentication, reuse cache and never disclose provider credentials',async()=>{
  let loggedIn=true,enabled=true,token='private-token',calls=0,fail=false;
  const db:any={setting:{findMany:async()=>[{key:'rating:enabled',value:String(enabled)},{key:'rating:token',value:token}]}};
  const request:any=async(url:string,options:any)=>{calls++;assert.equal(new URL(url).origin,'https://api.themoviedb.org');assert.ok(!url.includes(token));assert.equal(options.headers.Authorization,'Bearer '+token);if(fail)return new Response('private upstream failure',{status:401});return Response.json(url.includes('/genre/')?{genres:[{id:878,name:'科幻'}]}:{results:[{id:1,title:'Fixture',vote_average:8.5,vote_count:500}],total_pages:5,total_results:100});};
  const app=express();registerCatalog(app,db,{requireUser:async(_req:any,res:any)=>{if(!loggedIn){res.status(401).json({error:'login required'});return null}return {id:1}}},request,{});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try{
    let result=await (await fetch(base+'/api/catalog?type=movie&mode=rating')).json();assert.equal(result.provider,'TMDB');assert.equal(result.hasMore,true);assert.equal(result.items[0].score,8.5);assert.equal(JSON.stringify(result).includes(token),false);
    await fetch(base+'/api/catalog?type=movie&mode=rating');assert.equal(calls,1);
    result=await (await fetch(base+'/api/catalog?type=movie&mode=rating&page=2')).json();assert.equal(result.items[0].rank,21);assert.equal(calls,2);
    const genre=await (await fetch(base+'/api/catalog/options?type=tv')).json();assert.equal(genre.genres[0].id,878);
    assert.equal((await fetch(base+'/api/catalog?mode=week&genre=878')).status,400);
    assert.equal((await fetch(base+'/api/catalog?type=person')).status,400);
    fail=true;const failed=await fetch(base+'/api/catalog?mode=month');assert.equal(failed.status,503);assert.equal((await failed.text()).includes('private'),false);
    enabled=false;assert.equal((await fetch(base+'/api/catalog?mode=rating')).status,503);
    enabled=true;token='';assert.equal((await fetch(base+'/api/catalog?mode=rating')).status,503);
    loggedIn=false;assert.equal((await fetch(base+'/api/catalog')).status,401);assert.equal((await fetch(base+'/api/catalog/options')).status,401);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
});
test('24/48/96 catalog pages map onto fixed 20-row upstream pages without gaps, overlap or wrong ranks',async()=>{
  const db:any={setting:{findMany:async()=>[{key:'rating:enabled',value:'true'},{key:'rating:token',value:'fixture-token'}]}};
  let maxPage=0;const request:any=async(url:string)=>{const page=Number(new URL(url).searchParams.get('page'));maxPage=Math.max(maxPage,page);const total=url.includes('/tv')?10000:113;return Response.json({results:Array.from({length:Math.max(0,Math.min(20,total-(page-1)*20))},(_,i)=>({id:(page-1)*20+i+1,title:'Fixture '+((page-1)*20+i+1),vote_average:8,vote_count:400})),total_pages:Math.ceil(total/20),total_results:total})};
  const app=express();registerCatalog(app,db,{requireUser:async()=>({id:1})},request,{});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}/api/catalog`;
  try{
    for(const pageSize of [24,48,96]){
      const rows=[];for(let page=1;page<=Math.ceil(113/pageSize);page++){const data=await(await fetch(base+'?pageSize='+pageSize+'&page='+page)).json();assert.equal(data.pageSize,pageSize);assert.equal(data.totalPages,Math.ceil(113/pageSize));assert.equal(data.hasMore,page<Math.ceil(113/pageSize));for(const item of data.items)assert.equal(item.rank,item.id);rows.push(...data.items.map((item:any)=>item.id));}
      assert.deepEqual(rows,Array.from({length:113},(_,i)=>i+1));
    }
    const last=await(await fetch(base+'?type=tv&pageSize=96&page=105')).json();assert.equal(last.items.length,16);assert.equal(last.items[0].id,9985);assert.equal(last.items.at(-1).rank,10000);assert.equal(last.hasMore,false);assert.equal(maxPage,500);
    assert.equal((await fetch(base+'?pageSize=999')).status,400);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
});
