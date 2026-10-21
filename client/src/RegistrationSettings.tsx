import React,{useEffect,useState} from 'react';

const endpoint=(import.meta.env.VITE_API_URL||'')+'/api/settings';

export default function RegistrationSettings(){
  const [enabled,setEnabled]=useState(false),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    fetch(endpoint,{credentials:'include',cache:'no-store',signal:controller.signal}).then(async response=>{
      const data=await response.json();if(!response.ok)throw Error(data.error||'读取注册设置失败');
      if(!controller.signal.aborted){setEnabled(data.allowRegister==='true');setLoaded(true);}
    }).catch(error=>{if(error.name!=='AbortError')setError(error.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[]);
  async function save(){
    if(!loaded||loading||saving)return;setSaving(true);setError('');setMessage('');
    try{
      const response=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowRegister:String(enabled)})});
      const data=await response.json();if(!response.ok)throw Error(data.error||'保存注册设置失败');
      setMessage(enabled?'注册已开放；未登录用户刷新登录页即可看到注册入口。':'注册已关闭，现有账号仍可登录。');
    }catch(error:any){setError(error.message)}finally{setSaving(false)}
  }
  return <section><h2>账号注册</h2><div className="admin-form full"><label className="toggle"><input type="checkbox" checked={enabled} disabled={!loaded||loading||saving} onChange={event=>{setEnabled(event.target.checked);setMessage('')}}/><span/>允许用户自行注册</label><p>开启后，未登录的登录页显示“注册新账号”。新用户固定为普通账号、初始积分为0，不会获得管理员权限。</p><p>本项单独保存，不会覆盖其他网站设置。已登录账号会自动跳过登录和注册页面。</p><button type="button" className="primary" disabled={!loaded||loading||saving} onClick={()=>void save()}>{loading?'正在读取…':saving?'正在保存…':'保存注册设置'}</button>{message&&<p role="status" className="success-message">{message}</p>}{error&&<p role="alert" className="form-error">{error}</p>}</div></section>;
}
