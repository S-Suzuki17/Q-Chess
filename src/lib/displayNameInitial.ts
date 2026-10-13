let segmenter:Intl.Segmenter|undefined;
/** Keep emoji, combining marks and joined scripts intact in an avatar initial. */
export function displayNameInitial(name:string):string{
 const trimmed=name.trim();if(!trimmed)return '?';
 const initial=typeof Intl.Segmenter==='function'
  ?(segmenter??=new Intl.Segmenter(undefined,{granularity:'grapheme'})).segment(trimmed)[Symbol.iterator]().next().value?.segment
  :Array.from(trimmed)[0];
 return initial&&!(initial.length===1&&initial.charCodeAt(0)>=0xd800&&initial.charCodeAt(0)<=0xdfff)?initial:'?';
}
