import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerBrowse,xmlCategories,matchCategories,matchesFilters} from '../src/browse.js';

test('XML sources expose all named categories',()=>{
  const rows=xmlCategories('<rss><class><ty id="1">电影</ty><ty id="6">动作片</ty><ty id="7"><![CDATA[喜剧片]]></ty></class></rss>');
  assert.deepEqual(matchCategories(rows,'电影').map(x=>x.name),['电影','动作片','喜剧片']);
});
test('category hierarchy includes subcategories with nonstandard names',()=>{
  const rows=[{id:'1',parent:'0',name:'电影'},{id:'2',parent:'1',name:'经典修复'},{id:'3',parent:'0',name:'电视剧'}];
  assert.deepEqual(matchCategories(rows,'电影').map(x=>x.id),['1','2']);
});
test('combined metadata filters accept aliases and reject mismatches',()=>{
  const item={vod_area:'中国大陆',vod_year:'2026',vod_lang:'汉语普通话'};
  assert.equal(matchesFilters(item,{area:'大陆',year:'2026',language:'国语'}),true);
  assert.equal(matchesFilters(item,{area:'日本',year:'2026',language:'国语'}),false);
  assert.equal(matchesFilters(item,{year:'2025'}),false);
  assert.equal(matchesFilters(item,{language:'英语'}),false);
});
test('remote browse preserves every subcategory and verifies filters even when upstream ignores them',async()=>{
  const source={key:'test',api:'https://example.test/vod'};
  const db:any={source:{findUnique:async()=>source},video:{count:async()=>0,findMany:async()=>[]},categoryBinding:{findMany:async()=>[]}};
  const app=express();
  registerBrowse(app,db,{
    fetchText:async url=>{const u=new URL(url),page=Number(u.searchParams.get('pg')||1);return JSON.stringify(u.searchParams.get('ac')==='list'?{class:[{type_id:1,type_name:'电影'},{type_id:2,type_pid:1,type_name:'动作片'},{type_id:3,type_pid:1,type_name:'喜剧片'}]}:{list:Array.from({length:Math.min(12,Math.max(0,50-(page-1)*12))},(_,i)=>({vod_id:u.searchParams.get('t')+':'+((page-1)*12+i),vod_name:'title',vod_area:'中国大陆',vod_year:'2026',vod_lang:'汉语普通话'})),total:50,limit:12})},
    parseRemote:body=>{const raw=JSON.parse(body);return {raw,list:raw.list,total:raw.total}},
    publicVideo:(_source,x)=>({id:x.vod_id,area:x.vod_area,year:x.vod_year,language:x.vod_lang})
  });
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}/api/sources/test`;
  try{
    const options=await (await fetch(base+'/browse-options?group=电影')).json();assert.deepEqual(options.categories.map((x:any)=>x.name),['动作片','喜剧片']);
    const all=await (await fetch(base+'/browse?group=电影')).json();assert.equal(all.items.length,48);assert.deepEqual(all.items.slice(0,3).map((x:any)=>x.id),['1:0','2:0','3:0']);assert.equal(all.hasMore,true);
    const filtered=await (await fetch(base+'/browse?group=电影&sub=2&area=大陆&year=2026&language=国语')).json();assert.equal(filtered.items.length,48);
    const empty=await (await fetch(base+'/browse?group=电影&area=日本')).json();assert.equal(empty.items.length,0);assert.equal(empty.hasMore,false);assert.equal(empty.total,0);
    assert.equal((await fetch(base+'/browse?group=电影&sub=999')).status,400);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
