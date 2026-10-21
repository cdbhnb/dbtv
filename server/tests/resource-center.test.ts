import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {resourceCatalog,canonicalResourceApi} from '../src/resource-catalog.js';
import {resourceSource,registerResourceCenter} from '../src/resource-center.js';

test('candidate directory is a source file with public safe links; API comparison does not ignore query credentials',()=>{
  assert.equal(resourceCatalog.length,1);
  for(const item of resourceCatalog){assert.equal(new URL(item.homepage).protocol,'https:');assert.equal(new URL(item.api).protocol,'https:');assert.equal(new URL(item.api).search,'');}
  assert.equal(canonicalResourceApi('https://EXAMPLE.com/feed/'),canonicalResourceApi('https://example.com/feed'));
  assert.notEqual(canonicalResourceApi('https://example.com/feed?token=one'),canonicalResourceApi('https://example.com/feed?token=two'));
  assert.equal(canonicalResourceApi('javascript:alert(1)'),'');assert.equal(canonicalResourceApi('https://name:secret@example.com'),'');
});
test('existing matching interfaces are adopted without duplicates, and key collisions never overwrite',()=>{
  const entry=resourceCatalog[0];
  const configured={key:'custom-key',type:'tvbox-json',api:entry.api.replace(/\/$/,''),enabled:false};
  assert.equal(resourceSource(entry,[configured]),configured);
  assert.throws(()=>resourceSource(entry,[{...configured,key:entry.key,api:'https://other.invalid/feed'}]),/未覆盖/);
  assert.throws(()=>resourceSource(entry,[configured,{...configured,key:'duplicate'}]),/重复接口/);
});
test('listing and checking never create database rows; only publishing does, and unpublishing retains configuration',async()=>{
  const rows:any[]=[];let created=0,updated=0,invalidated=0,inspected=0;
  const source={findMany:async()=>rows,create:async({data}:any)=>{created++;const row={...data};rows.push(row);return row;},update:async({where,data}:any)=>{updated++;const row=rows.find(x=>x.key===where.key);Object.assign(row,data);return row;}};
  const db:any={source,$transaction:async(callback:any)=>callback({source})};
  const app=express();app.use(express.json());registerResourceCenter(app,db,{requireAdmin:async(req:any,res:any)=>{if(req.headers.authorization!=='admin'){res.status(req.headers.authorization?403:401).json({error:'拒绝访问'});return null;}return {role:'admin'};},inspect:async()=>{inspected++;return {raw:{class:[]},list:[{vod_name:'fixture'}],total:123};},invalidate:()=>{invalidated++;}});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}/api/admin/resource-center`;
  const call=(path='',method='GET',body?:any,authorization='admin')=>fetch(base+path,{method,headers:{Authorization:authorization,'Content-Type':'application/json'},...body===undefined?{}:{body:JSON.stringify(body)}});
  try{
    assert.equal((await call('','GET',undefined,'')).status,401);assert.equal((await call('','GET',undefined,'user')).status,403);
    const listed=await (await call()).json();assert.equal(listed.storage,'source-file');assert.equal(listed.items[0].published,false);assert.equal(created,0);
    assert.equal((await call('/feifan/check','POST')).status,200);assert.equal(inspected,1);assert.equal(created,0);
    assert.equal((await call('/feifan/publication','PUT',{published:false})).status,200);assert.equal(created,0);
    for(const body of [{published:'true'},{published:1},{published:true,api:'http://127.0.0.1/private'}])assert.equal((await call('/feifan/publication','PUT',body)).status,400);
    assert.equal((await call('/unknown/publication','PUT',{published:true})).status,404);
    assert.equal((await call('/feifan/publication','PUT',{published:true})).status,200);assert.equal(created,1);assert.equal(rows[0].enabled,true);assert.equal(rows[0].api,resourceCatalog[0].api);
    assert.equal((await call('/feifan/publication','PUT',{published:true})).status,200);assert.equal(created,1);assert.equal(updated,0);
    rows[0].searchable=false;rows[0].name='管理员自定义名字';
    assert.equal((await call('/feifan/publication','PUT',{published:false})).status,200);assert.equal(rows.length,1);assert.equal(rows[0].enabled,false);
    assert.equal((await call('/feifan/publication','PUT',{published:true})).status,200);assert.equal(rows[0].searchable,false);assert.equal(rows[0].name,'管理员自定义名字');assert.equal(invalidated,5);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
