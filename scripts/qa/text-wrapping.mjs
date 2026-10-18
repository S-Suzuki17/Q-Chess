export async function textWrapping(page,selector,lang){
 return page.locator(selector).evaluate((root,requestedLanguage)=>{
  const broken=[],hyphenated=[],clippedWords=[],rootRect=root.getBoundingClientRect(),language=root.closest('[lang]')?.getAttribute('lang')||document.documentElement.lang||requestedLanguage,walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),segmenter=new Intl.Segmenter(language,{granularity:'word'});
  let node;
  while((node=walker.nextNode())){
   const parent=node.parentElement;
   if(!parent||parent.closest('svg,script,style,code,pre,input,select,option,[aria-hidden=true],.sr-only'))continue;
   const style=getComputedStyle(parent),control=parent.closest('button,[role=tab]'),controlRect=control?.getBoundingClientRect();
   if(style.visibility!=='visible'||!parent.getClientRects().length)continue;
   const parentRect=parent.getBoundingClientRect();if(parentRect.width<=2&&parentRect.height<=2)continue;
   for(const part of segmenter.segment(node.textContent)){
    if(language==='zh'&&!/^[\p{Script=Latin}\p{Script=Cyrillic}\p{M}]+$/u.test(part.segment))continue;
    if(!part.isWordLike||!/[\p{L}][\p{L}\p{M}]/u.test(part.segment))continue;
    const range=document.createRange();range.setStart(node,part.index);range.setEnd(node,part.index+part.segment.length);
    const rects=Array.from(range.getClientRects()).filter(rect=>rect.width>.5&&rect.height>0);
    if(rects.some(rect=>rect.left<rootRect.left-1||rect.right>rootRect.right+1||(controlRect&&(rect.left<controlRect.left-1||rect.right>controlRect.right+1))))clippedWords.push({word:part.segment,context:node.textContent.trim().slice(0,180),element:parent.tagName.toLowerCase(),className:parent.className});
    if(rects.length<2)continue;
    const tops=rects.map(rect=>rect.top),font=parseFloat(style.fontSize);
    if(Math.max(...tops)-Math.min(...tops)<font*.85)continue;
    const item={word:part.segment,context:node.textContent.trim().slice(0,180),element:parent.tagName.toLowerCase(),className:parent.className,
     language:parent.closest('[lang]')?.getAttribute('lang')??document.documentElement.lang,
     overflowWrap:style.overflowWrap,wordBreak:style.wordBreak,hyphens:style.hyphens};
    if(style.hyphens==='auto'&&!['ja','zh','hi','ta'].includes(language))hyphenated.push(item);else broken.push(item);
   }
  }
  return {broken,hyphenated,clippedWords,horizontalOverflow:root.scrollWidth>root.clientWidth+1,effectiveLanguage:language,autoPhraseSupported:CSS.supports('word-break','auto-phrase')};
 },lang);
}
