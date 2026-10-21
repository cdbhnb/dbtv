import test from 'node:test';
import assert from 'node:assert/strict';
import {readPagination,fixedPageWindow,createMergedPagination,remoteHasMore} from '../src/pagination.js';
import {videoPageSize,videoPagePreference,videoPageNumber} from '../../client/src/video-page-size.ts';

test('auto page size adapts to CSS width; explicit preferences and invalid inputs are deterministic',()=>{
  assert.deepEqual([390,767,768,1440,1799,1800,2560].map(width=>videoPageSize('auto',width)),[24,24,48,48,48,96,96]);
  assert.equal(videoPageSize('96',390),96);assert.equal(videoPageSize('24',2560),24);
  assert.equal(videoPagePreference('999'),'auto');assert.equal(videoPagePreference('48'),'48');
  for(const value of [0,-1,1.5,'NaN',10001])assert.equal(videoPageNumber(value),1);
  assert.throws(()=>readPagination({pageSize:999}));assert.throws(()=>readPagination({pageSize:0}));assert.throws(()=>readPagination({page:1.5}));
  assert.deepEqual(fixedPageWindow(2,48),{offset:48,first:3,last:5,skip:8});
  assert.deepEqual(fixedPageWindow(105,96),{offset:9984,first:500,last:504,skip:4});
});
test('merged remote pagination deduplicates parent/child buckets and preserves a stable stream for every size',async()=>{
  const pager=createMergedPagination(),buckets=[Array.from({length:70},(_,i)=>i+1),Array.from({length:70},(_,i)=>i+51)];
  const load=async(bucket:number,page:number)=>({items:buckets[bucket].slice((page-1)*20,page*20).map(id=>({id})),hasMore:page*20<buckets[bucket].length});
  const parts=await Promise.all([1,2,3].map(page=>pager.get('fixed-provider',2,page,48,load)));
  const ids=parts.flatMap(part=>part.items.map(item=>item.id));assert.equal(ids.length,120);assert.equal(new Set(ids).size,120);
  assert.deepEqual([...ids].sort((a,b)=>a-b),Array.from({length:120},(_,i)=>i+1));assert.equal(parts[2].hasMore,false);assert.equal(parts[2].total,120);
  const smaller=[];for(let page=1;page<=5;page++)smaller.push(...(await pager.get('fixed-provider',2,page,24,load)).items.map(item=>item.id));assert.deepEqual(smaller,ids);
  const wide=await pager.get('fixed-provider',2,1,96,load);assert.deepEqual(wide.items.map(item=>item.id),ids.slice(0,96));
});
test('filtering precedes pagination; repeated provider pages stop, failures can retry without partial commits',async()=>{
  const pager=createMergedPagination();
  const filtered=await pager.get('filtered',1,1,24,async(_bucket,page)=>({items:Array.from({length:20},(_,i)=>({id:(page-1)*20+i+1})),hasMore:page<3}),item=>item.id%2===0);
  assert.equal(filtered.items.length,24);assert.equal(filtered.hasMore,true);
  const repeated=await pager.get('broken-source',1,1,48,async()=>({items:[{id:'same'}],hasMore:true}));assert.equal(repeated.items.length,1);assert.equal(repeated.hasMore,false);assert.match(repeated.paginationWarning!,/重复/);
  let failed=true;const load=async(bucket:number)=>{if(bucket===1&&failed)throw Error('upstream failure');return {items:[{id:bucket}],hasMore:false}};
  await assert.rejects(pager.get('retry',2,1,24,load));failed=false;assert.deepEqual((await pager.get('retry',2,1,24,load)).items.map(item=>item.id),[0,1]);
  assert.equal(remoteHasMore({raw:{pagecount:3},list:Array(20)},2,20),true);assert.equal(remoteHasMore({raw:{total:41},list:[{}]},3,20),false);
});
