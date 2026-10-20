import assert from 'node:assert/strict';

// Independent browser inputs. These operate real squares and special-move choices;
// engine tests separately prove the resulting candidates and terminal states.
export const tutorialExercises=[
 ['pawn-step',[['e2','e3']]],['pawn-double',[['e2','e4']]],
 ['opponent-capture',[['e2','e4'],['f5','e4']]],['rook',[['a2','a5']]],
 ['bishop',[['c1','g5']]],['knight',[['b1','c3']]],['queen',[['d1','h5']]],['king',[['e1','f1']]],
 ['chess-castle',[['e1','g1']]],['promotion',[['e7','e8','2']]],
 ['en-passant',[['f7','f5'],['e5','f6']]],['check-block',[['c3','e5']]],
 ['self-check',[['e2','f2'],['e2','e8']]],['king-escape',[['e1','f1']]],
 ['stalemate',[['c7','b6']]],['checkmate',[['d6','d8']]],
 ['candidates',[['e4','h7']]],['deduction-chain',[['e4','h7'],['a7','a6'],['h7','h5']]],
 ['opponent-deduction',[['h7','h5']]],['captured-slots',[['a1','a4']]],
 ['castle',[['e1','g1','castle']]],['decline-promotion',[['e7','e8','normal']]],
 ['king-candidates',[['a1','a4']]],['last-king',[['a1','a4']]],
 ['quantum-mate',[['d5','d6'],['h7','h6'],['d6','d8']]],
];
async function activate(page,locator){await locator.focus();await page.keyboard.press('Enter');}
export async function readTutorialPages(page,tutorial,{strictFit=true}={}){
 const copy=tutorial.locator('.tutorial-paged-copy'),source=await copy.getAttribute('data-copy-source');
 while(!await copy.locator('[data-copy-previous]').isDisabled())await copy.locator('[data-copy-previous]').click();
 const parts=[];
 for(let index=0;index<100;index++){
  const fit=await copy.evaluate(element=>{
   const text=element.querySelector('[data-tutorial-step]'),space=element.querySelector('.tutorial-copy-space');
   return {textHeight:text.getBoundingClientRect().height,spaceHeight:space.clientHeight,content:text.textContent};
  });
  assert(fit.textHeight<=fit.spaceHeight+2,`Tutorial copy clipped: ${JSON.stringify(fit)}`);parts.push(fit.content);
  if(await copy.locator('[data-copy-next]').isDisabled())break;
  await copy.locator('[data-copy-next]').click();
 }
 assert.equal(parts.join(''),source,'Tutorial pagination lost or duplicated text');
 if(strictFit){
  const fit=await tutorial.evaluate(element=>{
   const rect=element.getBoundingClientRect(),footer=element.querySelector('.tutorial-actions').getBoundingClientRect();
   return {top:rect.top,bottom:rect.bottom,height:innerHeight,scroll:element.scrollHeight,client:element.clientHeight,
    footerTop:footer.top,footerBottom:footer.bottom,width:element.clientWidth,scrollWidth:element.scrollWidth};
  });
  assert(fit.top>=0&&fit.bottom<=fit.height+1&&fit.footerTop>=0&&fit.footerBottom<=fit.height+1,`Tutorial controls clipped: ${JSON.stringify(fit)}`);
  assert(fit.scroll<=fit.client+2&&fit.scrollWidth<=fit.width+1,`Tutorial needs scrolling: ${JSON.stringify(fit)}`);
 }
}
export async function walkTutorial(page,{readAllCopy=false,strictFit=true,onLesson=async()=>{},checkRecovery=false,progressKey='qg_tutorial_course_v2'}={}){
 const tutorial=page.locator('dialog.tutorial-shell'),picker=tutorial.locator('#tutorial-lesson-picker');
 await tutorial.waitFor();assert.equal(await picker.locator('option').count(),25);
 await picker.selectOption('0');
 const square=coordinate=>tutorial.locator('.tutorial-flat-board [data-square="'+coordinate+'"]');
 if(checkRecovery){
  await activate(page,square('e2'));await activate(page,square('d3'));
  assert.equal(await tutorial.getAttribute('data-tutorial-task'),'0');assert.equal(await tutorial.getAttribute('data-tutorial-complete'),'false');
  await activate(page,square('e2'));await activate(page,square('e4'));
  assert.equal(await tutorial.getAttribute('data-tutorial-task'),'0');
  await tutorial.locator('[data-tutorial-reset]').click();
  const progressBefore=await page.evaluate(()=>localStorage.getItem('qg_tutorial_course_v2'));
  await tutorial.locator('[data-tutorial-review-demo]').click();
  await page.waitForFunction(()=>{const dialog=document.querySelector('.tutorial-shell');return dialog?.getAttribute('aria-busy')==='true'&&dialog.dataset.tutorialTask==='1';});
  assert.equal(await tutorial.locator('[data-tutorial-next]').count(),0,'A demonstration must not offer lesson completion');
  await page.waitForFunction(()=>document.querySelector('.tutorial-shell')?.getAttribute('aria-busy')==='false');
  assert.equal(await tutorial.getAttribute('data-tutorial-task'),'0');
  assert.equal(await page.evaluate(()=>localStorage.getItem('qg_tutorial_course_v2')),progressBefore,'Examples must not grant lesson progress');
 }
 let exercises=0;
 for(let index=0;index<tutorialExercises.length;index++){
  const [id,actions]=tutorialExercises[index];
  await page.waitForFunction(expected=>document.querySelector('.tutorial-shell')?.dataset.tutorialLesson===expected,id);
  for(let task=0;task<actions.length;task++){
   if(readAllCopy)await readTutorialPages(page,tutorial,{strictFit});
   if(id==='quantum-mate'&&task===2&&checkRecovery){
    await activate(page,square('d6'));await activate(page,square('e6'));
    assert.equal(await tutorial.getAttribute('data-tutorial-task'),'2');
    assert.equal(await tutorial.getAttribute('data-tutorial-complete'),'false');
    await tutorial.locator('[data-tutorial-hint]').click();
   }
   const [from,to,choice]=actions[task];await activate(page,square(from));await activate(page,square(to));
   if(choice){
    const dialog=page.locator('dialog.tutorial-choice');await dialog.waitFor();
    if(checkRecovery){
     await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
     assert.equal(await tutorial.getAttribute('data-tutorial-task'),String(task));
     await activate(page,square(to));await dialog.waitFor();
    }
    if(id==='promotion')assert.equal(await dialog.locator('[data-tutorial-choice]').count(),4);
    await dialog.locator('[data-tutorial-choice="'+choice+'"]').click();
   }
   await page.waitForFunction(expected=>document.querySelector('.tutorial-shell')?.dataset.tutorialTask===String(expected),task+1);exercises++;
   if(id==='self-check'&&task===0)assert((await square('e2').getAttribute('aria-label')).includes(' · '),'Rejected move changed its origin');
  }
  assert.equal(await tutorial.getAttribute('data-tutorial-complete'),'true');
  if(readAllCopy)await readTutorialPages(page,tutorial,{strictFit});
  await onLesson({index,id,tutorial});
  if(id==='quantum-mate'){
   const names=async coordinate=>(await square(coordinate).getAttribute('aria-label')).split(' · ').at(-1).split(' / ');
   const attackerNames=await names('d8');
   assert.equal(new Set(attackerNames).size,2,'Mating piece must retain two displayed candidates');
   assert.deepEqual(await names('c7'),attackerNames,'Both attackers retain the same two localized candidates');
  }
  await tutorial.locator('[data-tutorial-next]').click();
 }
 await tutorial.waitFor({state:'detached'});
 const progress=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),progressKey);
 assert.equal(progress.completed.length,25);
 return {lessons:25,exercises,copyRead:readAllCopy,keyboardControls:true,specialChoiceCancellation:checkRecovery,unresolvedMate:true};
}
