import {useLayoutEffect} from 'react';
import {useLocation} from 'react-router-dom';

export default function NavigationScroll(){
  const location=useLocation();
  useLayoutEffect(()=>{
    // A same-page Link still gets a new location key. Reset both viewport
    // and body scrolling: the public layout can make body the scroll container.
    window.scrollTo({top:0,left:0,behavior:'instant'});
    document.documentElement.scrollTo({top:0,left:0,behavior:'instant'});
    document.body.scrollTo({top:0,left:0,behavior:'instant'});
  },[location.key]);
  return null;
}
