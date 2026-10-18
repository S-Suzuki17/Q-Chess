type Listener = {remove:()=>Promise<void>};
type RecoveryApp = {
 addListener(event:'pause',callback:()=>void):Promise<Listener>;
 addListener(event:'resume',callback:()=>void):Promise<Listener>;
};

/** Query existing purchases once per foreground transition; never start a purchase. */
export function startNativeCommerceRecovery({app,current,reconcile}:{
 app:RecoveryApp;current:()=>boolean;reconcile:()=>Promise<unknown>;
}){
 let disposed=false,running=false,requested=false,foreground=true;
 const valid=()=>!disposed&&current();
 const drain=async()=>{
  if(running||!foreground||!valid())return;
  running=true;
  try{
   while(requested&&foreground&&valid()){
    requested=false;
    // Offline/provider failures remain recoverable on the next foreground/online event.
    try{await reconcile();}catch{/* Explicit restore remains available. */}
   }
  }finally{running=false;}
 };
 const refresh=()=>{if(!valid())return;requested=true;void drain();};
 // pause/resume also covers a billing activity that pauses us without onStop.
 const listeners=[
  app.addListener('pause',()=>{foreground=false;}).catch(()=>null),
  app.addListener('resume',()=>{if(foreground)return;foreground=true;refresh();}).catch(()=>null),
 ];
 refresh();
 return {refresh,dispose:()=>{disposed=true;requested=false;for(const listener of listeners)void listener.then(handle=>handle?.remove()).catch(()=>{});}};
}
