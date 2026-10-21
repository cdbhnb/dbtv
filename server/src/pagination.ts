export function readPagination(input:Record<string,unknown>,fallback=48){
  const page=Number(input.page||1),pageSize=input.pageSize===undefined?fallback:Number(input.pageSize);
  if(!Number.isInteger(page)||page<1||page>10000||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('分页参数无效，每页最多100部');
  return {page,pageSize,offset:(page-1)*pageSize};
}
export function fixedPageWindow(page:number,pageSize:number,upstreamSize=20){const offset=(page-1)*pageSize;return {offset,first:Math.floor(offset/upstreamSize)+1,last:Math.ceil((offset+pageSize)/upstreamSize),skip:offset%upstreamSize}}

export type RemoteChunk={items:any[];hasMore:boolean};
// A stable, deduplicated stream across all category buckets. Raw public summaries
// are cached, never permissions or authenticated output. Each response is gated later.
export function createMergedPagination(){
  type State={expires:number;items:any[];seen:Set<string>;next:number[];done:boolean[];fingerprints:(string|undefined)[];running?:Promise<void>;truncated:boolean};
  const states=new Map<string,State>();
  async function get(key:string,buckets:number,page:number,pageSize:number,load:(bucket:number,page:number)=>Promise<RemoteChunk>,accept:(item:any)=>boolean=()=>true){
    if((page-1)*pageSize>=20000)throw Error('页码过深，请先缩小分类或筛选范围');
    let state=states.get(key);
    if(!state||state.expires<Date.now()){
      if(states.size>=8){const unused=[...states].find(([,value])=>!value.running);if(!unused)throw Error('片库分页繁忙，请稍后重试');states.delete(unused[0]);}
      state={expires:Date.now()+120000,items:[],seen:new Set(),next:Array(buckets).fill(1),done:Array(buckets).fill(false),fingerprints:[],truncated:false};states.set(key,state);
    }
    const value=state,end=page*pageSize;
    let requests=0;
    while(value.items.length<=end&&value.done.some(done=>!done)){
      if(value.running){await value.running;continue;}
      value.running=(async()=>{
        const active=value.done.flatMap((done,index)=>done?[]:[index]),chunks:{bucket:number;chunk:RemoteChunk}[]=[];
        // One layer must commit atomically, so failure/retry cannot skip categories.
        if(requests+active.length>96)throw Error('该筛选需要读取的远程分页较多，请缩小范围后重试');requests+=active.length;
        for(let i=0;i<active.length;i+=4)chunks.push(...await Promise.all(active.slice(i,i+4).map(async bucket=>({bucket,chunk:await load(bucket,value.next[bucket])}))));
        for(const {bucket,chunk} of chunks){
          const fingerprint=chunk.items.map(item=>String(item.id)).join('\u0000');
          if(!chunk.items.length||value.fingerprints[bucket]===fingerprint){if(chunk.items.length&&chunk.hasMore)value.truncated=true;value.done[bucket]=true;chunk.items=[];}
          else {value.fingerprints[bucket]=fingerprint;value.done[bucket]=!chunk.hasMore;}
          value.next[bucket]++;
        }
        for(let index=0;index<Math.max(0,...chunks.map(({chunk})=>chunk.items.length));index++)for(const {chunk} of chunks){
          const item=chunk.items[index];if(!item)continue;const id=String(item.id);if(value.seen.has(id))continue;value.seen.add(id);if(accept(item))value.items.push(item);
        }
        if(value.seen.size>20000)throw Error('读取结果较多，请缩小筛选范围');
      })();
      try{await value.running}catch(error){states.delete(key);throw error}finally{value.running=undefined}
    }
    const complete=value.done.every(Boolean);
    return {items:value.items.slice((page-1)*pageSize,end),page,pageSize,hasMore:value.items.length>end||!complete,total:complete?value.items.length:null,paginationWarning:value.truncated?'该源后续页重复，已停止重复加载。':undefined};
  }
  return {get};
}

export function remoteHasMore(result:any,page:number,limit:number){
  const raw=result.raw||{},count=raw.total??raw.recordcount??raw.data?.total;
  const pages=Number(raw.pagecount??raw.total_pages??raw.data?.pagecount);
  if(pages>0)return page<pages;
  if(count!==undefined&&Number.isFinite(Number(count)))return page*limit<Number(count);
  if(Number(result.total)>result.list.length)return page*limit<Number(result.total);
  return result.list.length>=limit&&limit>0;
}
