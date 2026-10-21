export type PlaybackEpisode={id:string;name:string;lineName:string;url:string;type:string;sortOrder:number};
export function episodeDisplayOrder<T extends {sortOrder:number}>(episodes:readonly T[],reverse=false):T[]{return [...episodes].sort((a,b)=>reverse?b.sortOrder-a.sortOrder:a.sortOrder-b.sortOrder);}
export function isDirectEpisode(episode:PlaybackEpisode){return episode.type==='m3u8'||/\.(?:mp4|webm|m4v|mov)(?:[?#]|$)/i.test(episode.url);}
export function episodeKey(name:string){
  const value=String(name||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
  const match=value.match(/^(?:第|ep(?:isode)?)?0*(\d+)(?:集|话|期)?$/);
  return match?'episode:'+Number(match[1]):value;
}
export function matchingEpisode(episodes:PlaybackEpisode[],current?:PlaybackEpisode){
  const ordered=[...episodes].sort((a,b)=>Number(isDirectEpisode(b))-Number(isDirectEpisode(a)));
  if(!current)return ordered[0];
  const key=episodeKey(current.name);
  return ordered.find(x=>episodeKey(x.name)===key)||(['正片','高清','hd','hd中字','完整版'].includes(key)?ordered.find(x=>['正片','高清','hd','hd中字','完整版'].includes(episodeKey(x.name))):undefined);
}
