import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {countAudience,registerDiscover} from '../src/discover.js';
import {belongs} from '../src/browse.js';

test('new main categories recognize source category names',()=>{
  for(const [name,group] of [['大陆综艺','综艺'],['真人秀','综艺'],['记录片','纪录片'],['古装仙侠','短剧'],['足球','体育']])assert.ok(belongs(name,group));
  assert.equal(belongs('剧情片','电视剧'),false);
});
test('audience counts unique users rather than episodes or progress updates',()=>{
  const at=new Date();const entry={sourceKey:'a',videoId:'a:1',userId:1,at};
  const rows=countAudience([entry,entry,{...entry,userId:2},{...entry,userId:null},{...entry,sourceKey:'b'}]);
  assert.equal(rows.length,2);assert.equal(rows[0].count,2);assert.equal(rows[1].count,1);
  assert.equal('users' in rows[0],false);
});
test('ranking respects accessible sources, hidden videos, privacy and authentication',async()=>{
  const at=new Date();let authenticated=true;
  const db:any={source:{findMany:async()=>[{key:'allowed',name:'Source'},{key:'secret',name:'Restricted'}]},
    watchHistory:{groupBy:async({where}:any)=>{assert.deepEqual(where.sourceKey.in,['allowed']);return [{sourceKey:'allowed',videoId:'hidden',userId:1,_max:{updatedAt:at}},{sourceKey:'allowed',videoId:'public',userId:1,_max:{updatedAt:at}}]},findFirst:async()=>({title:'Video',cover:''})},
    video:{findMany:async()=>[{id:'hidden'}]}};
  const app=express();registerDiscover(app,db,{requireUser:async(_req,res)=>{if(!authenticated){res.status(401).json({error:'请先登录'});return null}return {id:1}},canSource:(_user,key)=>key==='allowed'});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address() as {port:number};
  try{
    const response=await fetch(`http://127.0.0.1:${address.port}/api/discover`);assert.equal(response.status,200);
    const body=await response.json();assert.equal(body.items.length,1);assert.equal(body.items[0].id,'public');assert.equal(body.items[0].audience,1);
    assert.equal(JSON.stringify(body).includes('userId'),false);assert.equal(body.items[0].rank,1);
    authenticated=false;assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/discover`)).status,401);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
