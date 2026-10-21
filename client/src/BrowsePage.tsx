import React,{useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {CatalogPanel,CatalogSort,catalogModeParams,isCatalogMode} from './CatalogPage';
import './browse.css';
import {useVideoPagination,PageSizeControl} from './VideoPagination';

type Options={categories:{id:string;name:string}[];areas:string[];years:string[];languages:string[]};
async function request<T>(url:string,signal?:AbortSignal):Promise<T>{const response=await fetch((import.meta.env.VITE_API_URL||'')+'/api'+url,{credentials:'include',signal});const body=await response.json();if(!response.ok)throw new Error(body.error||'加载失败');return body;}
const emptyOptions:Options={categories:[],areas:[],years:[],languages:[]};

export default function BrowsePage({category,renderVideo}:{category:string;renderVideo:(video:any)=>React.ReactNode}){
  const [params,setParams]=useSearchParams();
  const pagination=useVideoPagination(),{page,pageSize}=pagination;
  const supportsCatalog=category==='电影'||category==='电视剧',sort=supportsCatalog&&isCatalogMode(params.get('sort')||'')?params.get('sort')!:'source',external=sort!=='source';
  const [sources,setSources]=useState<{key:string;name:string}[]>([]);
  const [source,setSource]=useState('');
  const [options,setOptions]=useState<Options>(emptyOptions);
  const [items,setItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  const [hasMore,setHasMore]=useState(false),[total,setTotal]=useState<number|null>(null),[retry,setRetry]=useState(0);
  const [paginationNote,setPaginationNote]=useState('');
  const urlSource=params.get('source')||'';
  const sub=params.get('sub')||'',area=params.get('area')||'',year=params.get('year')||'',language=params.get('language')||'';
  useEffect(()=>{const controller=new AbortController();request<{key:string;name:string}[]>('/library',controller.signal).then(async rows=>{
    setSources(rows);const saved=localStorage.getItem('tvbox.homeSource');
    const settings=await request<any>('/settings',controller.signal);
    const preferred=params.get('source')||saved||settings.homeSource;
    setSource(rows.find(x=>x.key===preferred)?.key||'');
  }).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>controller.abort()},[]);
  useEffect(()=>{if(urlSource&&sources.some(x=>x.key===urlSource))setSource(urlSource)},[urlSource,sources]);
  useEffect(()=>{setOptions(emptyOptions);if(!source||external)return;const controller=new AbortController();
    request<Options>(`/sources/${encodeURIComponent(source)}/browse-options?group=${encodeURIComponent(category)}`,controller.signal).then(setOptions).catch(e=>{if(e.name!=='AbortError')setError(e.message)});
    return()=>controller.abort();
  },[source,category,external]);
  useEffect(()=>{if(!source||external)return;const controller=new AbortController();setLoading(true);setItems([]);setError('');setHasMore(false);
    const query=new URLSearchParams({group:category,sub,area,year,language,page:String(page),pageSize:String(pageSize)});
    setPaginationNote('');request<any>(`/sources/${encodeURIComponent(source)}/browse?${query}`,controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      setItems(result.items);setHasMore(result.hasMore);setTotal(result.total);setPaginationNote(result.paginationWarning||'');
    }).catch(e=>{if(e.name!=='AbortError')setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[source,category,sub,area,year,language,page,pageSize,retry,external]);
  function change(key:string,value:string){const next=new URLSearchParams(params);next.delete('page');if(value)next.set(key,value);else next.delete(key);setParams(next);}
  function reset(){const next=new URLSearchParams(params);for(const key of ['sub','area','year','language','page'])next.delete(key);setParams(next);}
  function chooseSource(key:string){const next=new URLSearchParams(params);next.set('source',key);for(const name of ['sub','area','year','language','page'])next.delete(name);setParams(next);localStorage.setItem('tvbox.homeSource',key);setSource(key);}
  function turnPage(nextPage:number){const next=new URLSearchParams(params);next.set('page',String(nextPage));setParams(next);}
  const pager=<nav className="browse-pager" aria-label="资源分页"><button disabled={loading||page===1} onClick={()=>turnPage(page-1)}>← 上一页</button><span>第 {page} 页</span><button disabled={loading||!hasMore} onClick={()=>turnPage(page+1)}>下一页 →</button></nav>;
  const row=(label:string,key:string,value:string,values:{id:string;name:string}[])=><div className="browse-filter-row"><b>{label}</b><div><button type="button" aria-pressed={!value} className={!value?'active':''} onClick={()=>change(key,'')}>全部</button>{values.map(x=><button type="button" aria-pressed={value===x.id} className={value===x.id?'active':''} key={x.id} onClick={()=>change(key,x.id)}>{x.name}</button>)}</div></div>;
  const values=(list:string[])=>list.map(name=>({id:name,name}));
  const heading=<div className="page-heading catalog-heading"><div><small>分类片库{external?' · TMDB 榜单':''}</small><h1>{category}</h1></div>{supportsCatalog&&<CatalogSort withSource value={sort} onChange={value=>setParams(catalogModeParams(params,value))}/>}</div>;
  if(external)return <div className="content-page browse-page">{heading}<CatalogPanel type={category==='电视剧'?'tv':'movie'} mode={sort}/></div>;
  return <div className="content-page browse-page">{heading}
    <div className="source-switch" aria-label="选择数据源"><b>当前数据源</b>{sources.map(x=><button aria-pressed={source===x.key} className={source===x.key?'active':''} key={x.key} onClick={()=>chooseSource(x.key)}>{x.name}</button>)}</div>
    <section className="browse-filters" aria-label="影视筛选">
      <div className="browse-selected"><b>已选</b><div><span>{category}</span>{[options.categories.find(x=>x.id===sub)?.name,area,year,language].filter(Boolean).map(x=><span key={x}>{x}</span>)}</div><button onClick={reset}>↻ 重新筛选</button></div>
      {row('分类','sub',sub,options.categories)}
      {row('地区','area',area,values(options.areas))}
      {row('年份','year',year,values(options.years))}
      {row('语言','language',language,values(options.languages))}
      {!source&&<p className="browse-note">请先选择上方数据源，自动读取该源的分类。</p>}
    </section>
    <div className="browse-results-head"><b>资源列表</b><span>{total===null?`本页 ${items.length} 部`:`共 ${total} 部`}</span><PageSizeControl pagination={pagination}/></div>
    {source&&pager}
    {error&&<p role="alert" className="browse-error">{error}<button onClick={()=>setRetry(x=>x+1)}>重新加载</button></p>}
    <div className="movie-grid video-list-grid">{items.map(video=><React.Fragment key={video.id}>{renderVideo(video)}</React.Fragment>)}</div>
    {loading?<p role="status" className="browse-note">正在加载资源…</p>:source&&!items.length&&!error?<p className="browse-note">本页没有匹配内容。{hasMore?'可以查看下一页，或调整筛选条件。':'请调整筛选条件或切换数据源。'}</p>:null}
    {source&&items.length>0&&pager}
    {paginationNote&&<p className="browse-note">{paginationNote}</p>}
    {source&&(area||year||language)&&<p className="browse-note">远程源按页读取并核对地区、年份和语言；翻页可查看后续匹配内容。</p>}
  </div>;
}
