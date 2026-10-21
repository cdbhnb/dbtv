import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {categoryDenied,validateContentRules,createContentPolicy,registerContentPolicy} from '../src/content-policy.js';
import {effectiveMembership} from '../src/membership.js';

const rules={deniedSourceKeys:['blocked'],deniedCategories:[{sourceKey:'*',name:'伦理'}]};
test('simplified grade selection cannot be bypassed by legacy account grants and retains category restrictions',()=>{
  const free={id:'free',permissions:'["sources"]',sourceKeys:'["allowed"]',accessGroupIds:'["grade-group"]',contentRules:JSON.stringify({...rules,sourceSelection:'grade'})};
  const user={role:'user',sourceAccess:[{sourceKey:'manual'}],accessGroupIds:'["account-group"]'};
  const groups=[{id:'grade-group',enabled:true,sourceKeys:'["group","blocked"]'},{id:'account-group',enabled:true,sourceKeys:'["extra"]'}];
  const access=effectiveMembership(user,free,new Date(),groups);
  assert.deepEqual(access.sourceKeys,['allowed','group']);assert.equal(access.contentRules.sourceSelection,'grade');
  assert.deepEqual(effectiveMembership(user,{...free,sourceKeys:'[]',accessGroupIds:'[]'},new Date(),groups).sourceKeys,[]);
  assert.deepEqual(effectiveMembership(user,{...free,contentRules:null},new Date(),groups).sourceKeys.sort(),['allowed','blocked','extra','group','manual']);
});
test('category restrictions match aliases, descendants and source-scoped IDs, not movie titles',()=>{
  for(const category of ['伦理片','日本伦理','倫理片'])assert.equal(categoryDenied(rules,'one',{category}),true);
  assert.equal(categoryDenied(rules,'one',{title:'伦理研究',category:'纪录片'}),false);
  const categories=[{id:'8',parent:'0',name:'伦理片'},{id:'81',parent:'8',name:'经典修复'}];
  assert.equal(categoryDenied(rules,'one',{type_id:81},categories),true);
  const scoped={deniedSourceKeys:[],deniedCategories:[{sourceKey:'one',name:'伦理片',id:'8'}]};
  assert.equal(categoryDenied(scoped,'two',{type_id:81},categories),false);
  assert.equal(categoryDenied(scoped,'one',{type_id:81},categories),true);
  assert.throws(()=>validateContentRules({deniedSourceKeys:[],deniedCategories:[{sourceKey:'*',id:'8',name:'伦理'}]}));
});
test('source exclusions win over manual grants, source groups and all-sources plans; expired users use ordinary rules',()=>{
  const free={id:'free',permissions:'["sources"]',sourceKeys:'[]',contentRules:JSON.stringify(rules)};
  const sample={role:'user',sourceAccess:[{sourceKey:'blocked'}],accessGroupIds:'["custom"]'};
  const group={id:'custom',enabled:true,sourceKeys:'["blocked","allowed"]',permissions:'["playback"]'};
  assert.deepEqual(effectiveMembership(sample,free,new Date(),[group]).sourceKeys,['allowed']);
  assert.deepEqual(effectiveMembership(sample,{...free,allSources:true},new Date(),[group]).contentRules,rules);
  const expired={...sample,membershipPlanId:'vip',membershipExpiresAt:new Date(0),membershipPlan:{id:'vip',enabled:true,contentRules:null}};
  assert.deepEqual(effectiveMembership(expired,free).contentRules,rules);
  assert.deepEqual(effectiveMembership({...sample,role:'admin'},free).contentRules,{deniedSourceKeys:[],deniedCategories:[]});
});
test('content boundary removes restricted lists, variants, stale favorites and playback URLs; direct and forged writes denied',async()=>{
  const records:any={'one:good':{id:'one:good',sourceKey:'one',title:'可看片',category:'动作片',visible:true},'one:adult':{id:'one:adult',sourceKey:'one',title:'限制片',category:'伦理片',visible:true}};
  const user={role:'user',contentRules:rules};
  const db:any={source:{findUnique:async({where}:any)=>({key:where.key,type:'local',enabled:true})},video:{findUnique:async({where}:any)=>records[where.id]}};
  const policy=createContentPolicy(db,{canSource:()=>true,remoteDetail:async()=>null,categories:async()=>[]});
  const app=express();app.use(express.json());registerContentPolicy(app,policy,{requireUser:async()=>user,db,categories:async()=>[]});
  app.get('/api/search',(_req,res)=>res.json([{...records['one:good'],variants:[records['one:good'],records['one:adult']]}]));
  app.get('/api/sources/one/videos/adult',(_req,res)=>res.json({...records['one:adult'],episodes:[{url:'never-disclose.m3u8'}]}));
  app.get('/api/favorites',(_req,res)=>res.json([{sourceKey:'one',videoId:'one:adult',title:'stale'},{sourceKey:'one',videoId:'one:good',title:'allowed'}]));
  app.post('/api/history',(_req,res)=>res.json({ok:true}));
  app.get('/api/danmaku',(_req,res)=>res.json([{sourceKey:'simulated',videoId:'simulated',episodeId:'global',simulated:true,content:'测试装饰弹幕'},{sourceKey:'one',videoId:'one:adult',content:'受限内容'}]));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  try{
    const search=await (await fetch(base+'/search')).json();assert.equal(search.length,1);assert.deepEqual(search[0].variants.map((x:any)=>x.id),['one:good']);
    const direct=await fetch(base+'/sources/one/videos/adult');assert.equal(direct.status,403);assert.equal(JSON.stringify(await direct.json()).includes('never-disclose'),false);
    assert.deepEqual((await (await fetch(base+'/favorites')).json()).map((x:any)=>x.videoId),['one:good']);
    assert.equal((await fetch(base+'/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceKey:'one',videoId:'one:adult',category:'动作片'})})).status,403);
    assert.equal(await policy.allowed(user,'one','missing',{category:'动作片'}),false);
    assert.equal(await policy.allowed(user,'blocked','one:good'),false);
    assert.deepEqual((await (await fetch(base+'/danmaku')).json()).map((x:any)=>x.content),['测试装饰弹幕']);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('old collected mappings cannot disguise restricted remote categories and unknown metadata fails closed',async()=>{
  const db:any={source:{findUnique:async()=>({key:'remote',type:'tvbox-json',enabled:true})},video:{findUnique:async()=>({sourceKey:'remote',category:'电影',visible:true})}};
  const user={role:'user',contentRules:rules};
  const deps={canSource:()=>true,categories:async()=>[]};
  assert.equal(await createContentPolicy(db,{...deps,remoteDetail:async()=>({type_name:'伦理片'})}).allowed(user,'remote','remote:1'),false);
  assert.equal(await createContentPolicy(db,{...deps,remoteDetail:async()=>{throw Error('offline')}}).allowed(user,'remote','remote:1'),false);
});
test('custom groups can grant only selected subcategories; group unions broaden access but exclusions always win',async()=>{
  const free={id:'free',permissions:'["sources","playback"]',sourceKeys:'[]'};
  const group={id:'action',enabled:true,sourceKeys:'["one"]',categoryRules:'[{"sourceKey":"*","name":"动作"}]'};
  const sample={role:'user',accessGroupIds:'["action"]',sourceAccess:[]};
  const access=effectiveMembership(sample,free,new Date(),[group]);
  assert.equal(access.sourceScopes.one.length,1);
  const db:any={source:{findUnique:async()=>({key:'one',type:'local',enabled:true})},video:{findUnique:async({where}:any)=>({sourceKey:'one',visible:true,category:where.id==='good'?'动作片':'伦理片'})}};
  const policy=createContentPolicy(db,{canSource:()=>true,remoteDetail:async()=>null,categories:async()=>[]});
  assert.equal(await policy.allowed({...sample,...access},'one','good'),true);
  assert.equal(await policy.allowed({...sample,...access},'one','adult'),false);
  assert.deepEqual(effectiveMembership({...sample,sourceAccess:[{sourceKey:'one'}]},free,new Date(),[group]).sourceScopes,{});
  const denied=effectiveMembership(sample,{...free,contentRules:JSON.stringify({deniedSourceKeys:[],deniedCategories:[{sourceKey:'*',name:'动作'}]})},new Date(),[group]);
  assert.equal(await policy.allowed({...sample,...denied},'one','good'),false);
});
