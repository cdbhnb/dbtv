import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedSources,toggleSource,toggleSourceGroup,type SourceSelection} from '../../client/src/source-selection.ts';
const groups=[{id:'g1',name:'高清组',enabled:true,sourceKeys:'["a","b"]'},{id:'g2',name:'备用组',enabled:true,sourceKeys:'["b","c"]'},{id:'off',enabled:false,sourceKeys:'["d"]'}];
const keys=['a','b','c','d'];
const blank:SourceSelection={keys:[],groupIds:[],excluded:[],all:false};
test('group members are visibly selected without copying unrestricted manual grants',()=>{
  const state=toggleSourceGroup(blank,groups,'g1',true);
  assert.deepEqual(selectedSources(state,groups,keys),['a','b']);assert.deepEqual(state.keys,[]);
  assert.deepEqual(selectedSources(toggleSourceGroup(state,groups,'g1',false),groups,keys),[]);
});
test('unchecking an inherited source persists an exception; rechecking keeps category-scoped grant intact',()=>{
  const group=toggleSourceGroup(blank,groups,'g1',true),except=toggleSource(group,groups,'b',false);
  assert.deepEqual(selectedSources(except,groups,keys),['a']);assert.deepEqual(except.excluded,['b']);
  const restored=toggleSource(JSON.parse(JSON.stringify(except)),groups,'b',true);
  assert.deepEqual(selectedSources(restored,groups,keys),['a','b']);assert.deepEqual(restored.keys,[]);
  assert.deepEqual(selectedSources(toggleSourceGroup(except,groups,'g1',true),groups,keys),['a','b']);
});
test('overlapping groups, manual grants, disabled groups and future sources have consistent checkmarks',()=>{
  const state={...blank,keys:['d'],groupIds:['g1','g2','off']};
  assert.deepEqual(selectedSources(toggleSourceGroup(state,groups,'g1',false),groups,keys),['d','b','c']);
  const all={...blank,all:true,excluded:['b']};assert.deepEqual(selectedSources(all,groups,[...keys,'future']),['a','c','d','future']);
  assert.deepEqual(selectedSources({...blank,groupIds:['off']},groups,keys),[]);
});
