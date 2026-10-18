type BackHandler=()=>boolean;
type Listener={remove:()=>Promise<void>};
type BackApp={addListener:(event:'backButton',callback:(event:{canGoBack:boolean})=>void)=>Promise<Listener>;minimizeApp:()=>Promise<void>};

export function createAndroidBackHandlers(){
 const handlers:{run:BackHandler;priority:number}[]=[];
 return {
  register(run:BackHandler,priority=0){
   const entry={run,priority};handlers.push(entry);
   return()=>{const index=handlers.indexOf(entry);if(index!==-1)handlers.splice(index,1);};
  },
  handle(){
   for(const entry of [...handlers].reverse().sort((a,b)=>b.priority-a.priority))if(entry.run())return true;
   return false;
  },
 };
}
export const androidBackHandlers=createAndroidBackHandlers();

/** Use the same cancellation path as Escape, including dialogs that prohibit dismissal. */
export function cancelTopAndroidDialog(doc:Document){
 const dialogs=Array.from(doc.querySelectorAll<HTMLDialogElement>('dialog[open]'));
 const focused=doc.activeElement?.closest('dialog[open]') as HTMLDialogElement|null;
 const dialog=focused??dialogs.at(-1);
 if(!dialog)return false;
 const event=new Event('cancel',{cancelable:true,bubbles:false});
 if(dialog.dispatchEvent(event))dialog.close();
 return true;
}

export function installAndroidBack({app,dialogs,handle,historyBack}:{app:BackApp;dialogs:()=>boolean;handle:()=>boolean;historyBack:()=>void}){
 let disposed=false;
 const listener=app.addListener('backButton',({canGoBack})=>{
  if(disposed||dialogs()||handle())return;
  if(canGoBack)historyBack();else void app.minimizeApp().catch(()=>{});
 }).catch(()=>null);
 return()=>{disposed=true;void listener.then(handle=>handle?.remove()).catch(()=>{});};
}
