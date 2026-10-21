import React,{useEffect,useId,useRef,useState} from 'react';

export type PickerAccount={id:number;memberNo:string;username:string;displayName?:string;points:number;enabled:boolean};
export default function AccountPicker({value,onChange,disabled=false}:{value:PickerAccount|null;onChange:(account:PickerAccount|null)=>void;disabled?:boolean}){
  const id=useId(),container=useRef<HTMLDivElement>(null);
  const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[items,setItems]=useState<PickerAccount[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(''),[active,setActive]=useState(-1);
  useEffect(()=>{
    if(!open)return;const controller=new AbortController();setLoading(true);setError('');
    const timer=window.setTimeout(()=>{
      fetch((import.meta.env.VITE_API_URL||'')+'/api/admin/member-search?q='+encodeURIComponent(query),{credentials:'include',cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'查询失败');if(!controller.signal.aborted){setItems(data.items);setTotal(data.total);setActive(-1)}}).catch(e=>{if(e.name!=='AbortError'){setItems([]);setError(e.message)}}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    },220);
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[query,open]);
  function choose(account:PickerAccount){setQuery(account.username);onChange(account);setOpen(false);setActive(-1)}
  return <div className="account-picker" ref={container} onBlur={event=>{if(!container.current?.contains(event.relatedTarget as Node))setOpen(false)}}>
    <label htmlFor={id}>查找并选择用户</label><div className="account-search-field"><span aria-hidden="true">⌕</span><input id={id} disabled={disabled} role="combobox" aria-expanded={open} aria-controls={id+'-results'} aria-autocomplete="list" aria-activedescendant={active>=0?id+'-'+active:undefined} autoComplete="off" placeholder="输入用户名、昵称或会员号搜索" value={query} onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setItems([]);onChange(null);setOpen(true)}} onKeyDown={event=>{
      if(event.key==='Escape'){setOpen(false);return}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(index=>!items.length?-1:index<0?(event.key==='ArrowDown'?0:items.length-1):(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length)}
      if(event.key==='Enter'){event.preventDefault();if(open&&!loading&&active>=0&&items[active])choose(items[active]);else setOpen(true)}
    }}/>{query&&<button type="button" aria-label="清除用户搜索" disabled={disabled} onClick={()=>{setQuery('');onChange(null);setOpen(true)}}>×</button>}</div>
    {open&&<div className="account-result-panel"><div className="account-search-caption">{loading?'正在搜索…':error||`找到 ${total} 个账号${total>20?' · 显示前20个，请继续输入缩小范围':''}`}</div><div id={id+'-results'} role="listbox" aria-label="用户搜索结果">{!loading&&!error&&items.map((account,index)=><button type="button" role="option" id={id+'-'+index} aria-selected={value?.id===account.id} className={active===index?'active':''} key={account.id} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(account)}><span className="account-initial">{(account.displayName||account.username).slice(0,1).toUpperCase()}</span><span><b>{account.displayName||account.username}</b><small>{account.username} · {account.memberNo}</small></span><span className="account-balance">{account.points} 积分<small>{account.enabled?'正常账号':'已禁用'}</small></span></button>)}</div>{!loading&&!error&&!items.length&&<p className="account-search-caption">没有匹配账号，请检查用户名或会员号。</p>}</div>}
    {value&&<div className="account-selected"><span className="account-initial">{value.username.slice(0,1).toUpperCase()}</span><div><small>已选定操作对象</small><b>{value.username}</b><code>{value.memberNo}</code></div><strong>{value.points} <small>积分</small></strong></div>}
  </div>;
}
