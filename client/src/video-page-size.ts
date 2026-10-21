export const videoPageSizeKey='dbtv.videoPageSize';
export type VideoPagePreference='auto'|'24'|'48'|'96';
export function videoPagePreference(value:unknown):VideoPagePreference{return ['24','48','96'].includes(String(value))?String(value) as VideoPagePreference:'auto'}
export function videoPageSize(preference:VideoPagePreference,width:number){return preference==='auto'?(width<768?24:width>=1800?96:48):Number(preference)}
export function videoPageNumber(value:unknown){const page=Number(value);return Number.isInteger(page)&&page>=1&&page<=10000?page:1}
