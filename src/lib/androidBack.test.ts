import {describe,it,expect,vi} from 'vitest';
import {createAndroidBackHandlers,cancelTopAndroidDialog,installAndroidBack} from './androidBack';
describe('Android Back ownership',()=>{
 it('prioritizes confirmation/panel over match/menu, then removes unmounted owners',()=>{
  const stack=createAndroidBackHandlers(),calls:string[]=[];
  stack.register(()=>{calls.push('menu');return true;},10);
  stack.register(()=>{calls.push('match');return true;},20);
  const remove=stack.register(()=>{calls.push('confirmation');return true;},40);
  expect(stack.handle()).toBe(true);expect(calls).toEqual(['confirmation']);remove();stack.handle();expect(calls).toEqual(['confirmation','match']);
 });
 it('falls through inactive handlers without calling the next navigation twice',()=>{
  const stack=createAndroidBackHandlers(),exit=vi.fn(()=>true);stack.register(exit,10);stack.register(()=>false,40);stack.handle();expect(exit).toHaveBeenCalledTimes(1);
 });
 it('delivers cancel to the focused nested dialog before its parent, preserving a prevented dismissal',()=>{
  const parent={dispatchEvent:vi.fn(()=>true),close:vi.fn()},child={dispatchEvent:vi.fn(()=>false),close:vi.fn()};
  const doc={querySelectorAll:()=>[parent,child],activeElement:{closest:()=>child}} as unknown as Document;
  expect(cancelTopAndroidDialog(doc)).toBe(true);expect(child.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({type:'cancel',cancelable:true}));expect(child.close).not.toHaveBeenCalled();expect(parent.dispatchEvent).not.toHaveBeenCalled();
 });
 it('uses native history or minimizes only after dialog and screen handlers decline',async()=>{
  let back!:(event:{canGoBack:boolean})=>void;
  const remove=vi.fn(async()=>{}),minimize=vi.fn(async()=>{}),history=vi.fn(),dialogs=vi.fn(()=>true),handle=vi.fn(()=>true);
  const stop=installAndroidBack({app:{addListener:async(_name,cb)=>{back=cb;return{remove};},minimizeApp:minimize},dialogs,handle,historyBack:history});
  back({canGoBack:false});expect(handle).not.toHaveBeenCalled();dialogs.mockReturnValue(false);back({canGoBack:false});expect(minimize).not.toHaveBeenCalled();
  handle.mockReturnValue(false);back({canGoBack:true});expect(history).toHaveBeenCalledTimes(1);back({canGoBack:false});expect(minimize).toHaveBeenCalledTimes(1);
  stop();await Promise.resolve();await Promise.resolve();back({canGoBack:false});expect(minimize).toHaveBeenCalledTimes(1);expect(remove).toHaveBeenCalledTimes(1);
 });
});
