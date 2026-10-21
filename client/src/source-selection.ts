export const sourceList=(value:unknown):string[]=>{try{const list=typeof value==='string'?JSON.parse(value):value;return Array.isArray(list)?list.filter(key=>typeof key==='string'):[]}catch{return []}};
export type SourceSelection={keys:string[];groupIds:string[];excluded:string[];all:boolean};
type Group={id:string;enabled:boolean;sourceKeys:unknown;name?:string};
const unique=(keys:string[])=>[...new Set(keys)];
export function selectedSources(state:SourceSelection,groups:Group[],sourceKeys:string[]){
  const inherited=groups.filter(group=>group.enabled&&state.groupIds.includes(group.id)).flatMap(group=>sourceList(group.sourceKeys));
  return unique([...state.keys,...inherited,...state.all?sourceKeys:[]]).filter(key=>sourceKeys.includes(key)&&!state.excluded.includes(key));
}
export function toggleSource(state:SourceSelection,groups:Group[],key:string,checked:boolean):SourceSelection{
  const inherited=groups.some(group=>group.enabled&&state.groupIds.includes(group.id)&&sourceList(group.sourceKeys).includes(key));
  return {...state,keys:checked?(inherited||state.all?state.keys:unique([...state.keys,key])):state.keys.filter(item=>item!==key),excluded:checked?state.excluded.filter(item=>item!==key):unique([...state.excluded,key])};
}
export function toggleSourceGroup(state:SourceSelection,groups:Group[],id:string,checked:boolean):SourceSelection{
  const members=sourceList(groups.find(group=>group.id===id)?.sourceKeys);
  return {...state,groupIds:checked?unique([...state.groupIds,id]):state.groupIds.filter(key=>key!==id),excluded:checked?state.excluded.filter(key=>!members.includes(key)):state.excluded};
}
