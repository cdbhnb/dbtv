import React from 'react';
const paths:Record<string,React.ReactNode>={
  play:<path d="m9 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>,
  plus:<path d="M12 5v14M5 12h14"/>,check:<path d="m5 12 4 4L19 6"/>,
  info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/></>,
  search:<><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
  left:<path d="m14 5-7 7 7 7"/>,right:<path d="m10 5 7 7-7 7"/>,
  close:<path d="m6 6 12 12M6 18 18 6"/>,
  sparkle:<><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  bookmark:<path d="M6 4h12v17l-6-4-6 4V4Z"/>,
};
export default function Icon({name,size=20}:{name:string;size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.info}</svg>}
