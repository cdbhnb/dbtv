import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {groupVideos,registerSearch,type SearchVideo} from '../src/search.js';
import {episodeKey,matchingEpisode} from '../../client/src/playback.js';

const item=(sourceKey:string,year?:number):SearchVideo=>({id:sourceKey+':1',sourceKey,sourceName:sourceKey,title:'同一部影片',year});
test('search groups sources without losing alternatives and splits remakes',()=>{
  const grouped=groupVideos([item('a',2020),item('b',2020),item('c',2023),item('d')]);
  assert.equal(grouped.length,3);
  assert.deepEqual(grouped[0].variants.map((x:any)=>x.sourceKey),['a','b']);
  assert.equal(grouped[1].year,2023);assert.equal(grouped[2].year,undefined);
  assert.equal(groupVideos([item('a',2020),item('b')]).length,1);
  const rows=Array.from({length:60},(_,i)=>({...item('a'),id:'a:'+i,title:'片名'+i}));rows.push({...item('b'),title:'片名0'});
  const merged=groupVideos(rows);assert.equal(merged.length,60);assert.equal(merged[0].variants.length,2);
});
test('episode switching preserves episode identity rather than selecting the first episode',()=>{
  const episode=(id:string,name:string)=>({id,name,lineName:'x',url:'https://example.test/x.mp4',type:'mp4',sortOrder:0});
  const episodes=[episode('first','第01集'),episode('second','EP02')];
  assert.equal(episodeKey('第02集'),episodeKey('EP02'));
  assert.equal(matchingEpisode(episodes,episode('current','第2集'))?.id,'second');
  assert.equal(matchingEpisode(episodes,episode('current','第3集')),undefined);
  assert.equal(matchingEpisode([episode('movie','正片')],episode('current','HD'))?.id,'movie');
  assert.equal(matchingEpisode([{...episode('web','第02话'),url:'https://example.test/play/page'},{...episode('hls','第02话'),type:'m3u8'}],episode('current','第02集'))?.id,'hls');
});
test('search and alternatives obey source flags, permissions, failures and year verification',async()=>{
  let loggedIn=true,bYear:number|undefined=2020,bSearchable=true,aEnabled=true;
  const sources=()=>[{key:'a',name:'甲源',enabled:aEnabled,searchable:true},{key:'b',name:'乙源',enabled:true,searchable:bSearchable},{key:'private',name:'受限源',enabled:true,searchable:true},{key:'off',name:'已关闭',enabled:false,searchable:true},{key:'broken',name:'故障源',enabled:true,searchable:true}];
  const requested:string[]=[];
  const db:any={source:{findMany:async()=>sources().filter(x=>x.enabled&&x.searchable),findUnique:async({where}:any)=>sources().find(x=>x.key===where.key)},video:{count:async()=>0,findUnique:async()=>null},searchStat:{create:async()=>({})}};
  const app=express();
  registerSearch(app,db,{
    requireUser:async(_req,res)=>{if(!loggedIn){res.status(401).json({error:'请先登录'});return null}return {id:1}},
    canSource:(_u,key)=>key!=='private',
    remoteList:async source=>{requested.push(source.key);if(source.key==='broken')throw new Error('offline');return {list:[item(source.key,source.key==='b'?bYear:2020)]}},
    localList:async()=>({list:[]}),publicVideo:(source,x)=>({...x,sourceName:source.name}),
    remoteDetail:async source=>item(source.key,source.key==='b'?2023:2020),localPublic:async()=>[]
  });
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}/api`;
  try{
    const search=await (await fetch(base+'/search?q=影片')).json();assert.equal(search.length,1);assert.deepEqual(search[0].variants.map((x:any)=>x.sourceName),['甲源','乙源']);assert.ok(!requested.includes('off'));assert.ok(!requested.includes('private'));
    let options=await (await fetch(base+'/playback-options?sourceKey=a&videoId=a:1')).json();assert.equal(options.items.length,2);
    bYear=undefined;options=await (await fetch(base+'/playback-options?sourceKey=a&videoId=a:1')).json();assert.equal(options.items.length,1);
    bYear=2020;bSearchable=false;const disabled=await (await fetch(base+'/search?q=影片')).json();assert.equal(disabled[0].variants.length,1);
    assert.equal((await fetch(base+'/playback-options?sourceKey=private&videoId=private:1')).status,403);
    aEnabled=false;assert.equal((await fetch(base+'/playback-options?sourceKey=a&videoId=a:1')).status,403);
    loggedIn=false;assert.equal((await fetch(base+'/search?q=影片')).status,401);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
