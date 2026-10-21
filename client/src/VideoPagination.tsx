import React,{useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {videoPagePreference,videoPageSize,videoPageNumber,videoPageSizeKey,type VideoPagePreference} from './video-page-size';
import './video-pagination.css';

function stored(){try{return videoPagePreference(localStorage.getItem(videoPageSizeKey))}catch{return 'auto' as const}}
export function useVideoPagination(){
  const [params,setParams]=useSearchParams();
  const [preference,setPreference]=useState<VideoPagePreference>(stored),[width,setWidth]=useState(()=>window.innerWidth);
  const pageSize=videoPageSize(preference,width),lastSize=useRef(pageSize),changed=lastSize.current!==pageSize;
  const page=changed?1:videoPageNumber(params.get('page')||1);
  useEffect(()=>{const resize=()=>setWidth(window.innerWidth),sync=()=>setPreference(stored());window.addEventListener('resize',resize);window.addEventListener('storage',sync);window.addEventListener('dbtv:page-size',sync);return()=>{window.removeEventListener('resize',resize);window.removeEventListener('storage',sync);window.removeEventListener('dbtv:page-size',sync)}},[]);
  useEffect(()=>{if(lastSize.current===pageSize)return;lastSize.current=pageSize;setParams(current=>{const next=new URLSearchParams(current);next.delete('page');return next},{replace:true})},[pageSize,setParams]);
  function choose(value:string){const next=videoPagePreference(value);try{localStorage.setItem(videoPageSizeKey,next)}catch{}setPreference(next);setParams(current=>{const copy=new URLSearchParams(current);copy.delete('page');return copy});window.dispatchEvent(new Event('dbtv:page-size'));}
  function turnPage(value:number){setParams(current=>{const next=new URLSearchParams(current);next.set('page',String(value));return next});}
  return {page,pageSize,preference,choose,turnPage};
}
export function PageSizeControl({pagination}:{pagination:ReturnType<typeof useVideoPagination>}){return <label className="video-page-size">每页显示<select aria-label="每页视频数量" value={pagination.preference} onChange={event=>pagination.choose(event.target.value)}><option value="auto">自动（{pagination.pageSize}部）</option>{[24,48,96].map(size=><option key={size} value={size}>{size}部</option>)}</select></label>}
