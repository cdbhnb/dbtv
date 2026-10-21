import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {matchingEpisode,type PlaybackEpisode} from './playback';
import './playback-sources.css';

type Video={id:string;sourceKey:string;title:string;year?:number;sourceName?:string;episodes?:PlaybackEpisode[]};
type Variant={id:string;sourceKey:string;sourceName:string;title:string;year?:number};
async function request<T>(url:string,signal?:AbortSignal):Promise<T>{const response=await fetch((import.meta.env.VITE_API_URL||'')+'/api'+url,{credentials:'include',signal});const body=await response.json();if(!response.ok)throw new Error(body.error||'读取数据源失败');return body;}
export default function PlaybackSources({sourceKey,videoId,video,mode='detail',currentEpisode,onBeforeSwitch}:{sourceKey:string;videoId:string;video?:Video;mode?:'detail'|'player';currentEpisode?:PlaybackEpisode;onBeforeSwitch?:()=>void}){
  const nav=useNavigate(),[items,setItems]=useState<Variant[]>([]),[loading,setLoading]=useState(false),[switching,setSwitching]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    setItems([]);setError('');if(!video||video.sourceKey!==sourceKey||video.id!==videoId)return;
    const controller=new AbortController();setLoading(true);
    request<{items:Variant[]}>(`/playback-options?${new URLSearchParams({sourceKey,videoId})}`,controller.signal).then(x=>{if(!controller.signal.aborted)setItems(x.items)}).catch(e=>{if(e.name!=='AbortError')setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[sourceKey,videoId,video?.id,retry]);
  async function choose(target:Variant){
    if(switching||(target.sourceKey===sourceKey&&target.id===videoId))return;
    setSwitching(true);setError('');
    try{
      const next=await request<Video>(`/sources/${encodeURIComponent(target.sourceKey)}/videos/${encodeURIComponent(target.id)}`);
      if(video?.year&&next.year&&video.year!==next.year)throw new Error('该源的影片年份不同，请重新搜索确认版本');
      onBeforeSwitch?.();
      const detail=`/detail/${encodeURIComponent(target.sourceKey)}/${encodeURIComponent(target.id)}`;
      const episode=matchingEpisode(next.episodes||[],currentEpisode);
      if(mode==='player'&&episode)nav(`/player/${encodeURIComponent(target.sourceKey)}/${encodeURIComponent(target.id)}/${encodeURIComponent(episode.id)}`);
      else nav(detail+(mode==='player'?'?chooseEpisode=1':''));
    }catch(e:any){setError(e.message)}finally{setSwitching(false)}
  }
  return <section className="playback-sources" aria-label="切换播放源"><div className="playback-source-heading"><b>播放源</b><span>{loading?'正在查找同名资源…':switching?'正在切换…':`${items.length||1} 个可用源`}</span></div>
    <div className="line-tabs">{(items.length?items:[{id:videoId,sourceKey,sourceName:video?.sourceName||sourceKey,title:video?.title||''}]).map(x=><button key={x.sourceKey+':'+x.id} disabled={switching} aria-pressed={x.sourceKey===sourceKey&&x.id===videoId} className={x.sourceKey===sourceKey&&x.id===videoId?'active':''} onClick={()=>void choose(x)}>{x.sourceName}{items.filter(y=>y.sourceKey===x.sourceKey).length>1?` · ${items.filter(y=>y.sourceKey===x.sourceKey).findIndex(y=>y.id===x.id)+1}`:''}</button>)}</div>
    {error&&<p role="alert">{error}<button onClick={()=>setRetry(x=>x+1)}>重新查找</button></p>}
    {mode==='player'&&<small>切换源会优先匹配当前集；未找到时进入该源选集。</small>}
  </section>;
}
