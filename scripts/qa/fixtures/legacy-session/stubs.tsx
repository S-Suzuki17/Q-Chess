import React from 'react';
import {captureOAuthCallback} from '../../../../src/lib/oauthLoginIntent';
import {circuitAccess} from '../../../../src/lib/circuitAccess';
const qa=()=>((window as any).qa??={});
const listeners=new Set<(event:string,session:unknown)=>void>();
Object.assign(window,{qaAuth:(event:string,session:unknown)=>{qa().session=session;listeners.forEach(fn=>fn(event,session));}});
export const oauthCallbackAtStartup=captureOAuthCallback();
export const supabase={auth:{
    async initialize(){if(qa().initializationError)return {error:{code:'access_denied'}};if(qa().consumeCallback!==false){const url=new URL(location.href);url.hash='';url.searchParams.delete('code');history.replaceState(null,'',url);}return {error:null};},
    async getSession(){return {data:{session:qa().session??null},error:null};},
    async getUser(){qa().userChecks=(qa().userChecks??0)+1;return {data:{user:qa().session?.user??null},error:null};},
    onAuthStateChange(fn:(event:string,session:unknown)=>void){listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};},
    async signInWithOAuth(){qa().oauthRequested=true;if(qa().oauthFails)throw new Error('Fixture cancellation');return {data:{url:'https://provider.invalid/fixture'},error:null};},
    async signOut(){listeners.forEach(fn=>fn('SIGNED_OUT',null));return {error:null};},
},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{name:'OAuth fixture'},error:null})})})})};
export const useAppPlatform=()=>({android:false,webContent:true,nativeServices:false});
export const useNativeAuthLinks=()=>({failed:false,dismiss:()=>{}});
export const useCampaignProgress=()=>({progress:{music:'standard'},update:()=>{},loaded:true});
export const useCampaignCloud=()=>({userId:null});
export const useFoundersRewards=()=>({available:false});
export const soundManager={getConfig:()=>({bgmVolume:0,seVolume:0}),subscribe:()=>()=>{},resumeBGM(){},playBGM(){},stopBGM(){},updateConfig(){}};
export const recordVisit=()=>{};
export const TermsGate=({children}:any)=>children;
export const LevelSelect=({user,onBack,onCampaign}:any)=><section data-testid="lobby" data-user={user.id}><p>{user.name}</p><button onClick={onBack}>Fixture logout</button><button onClick={onCampaign}>Fixture Circuit</button></section>;
export const CampaignMode=({user,onBack}:any)=>{React.useSyncExternalStore(circuitAccess.subscribe,circuitAccess.getSnapshot);return <section data-testid="circuit" data-granted={String(circuitAccess.canPlay(user))}><button onClick={onBack}>Fixture back</button></section>;};
export const GameBoard=({user,roomId,onHome}:any)=><section data-testid="match" data-user={user.id} data-room={roomId}><button onClick={onHome}>Fixture home</button></section>;
export const Link=({children,...props}:any)=><a {...props}>{children}</a>;
export const Empty=()=>null;
export function io(_url:string,options:any){
    const handlers=new Map<string,(...args:any[])=>void>();
    const socket={auth:options.auth,connected:false,on:(e:string,f:(...args:any[])=>void)=>{handlers.set(e,f);return socket;},
        connect(){socket.connected=true;handlers.get('connect')?.();return socket;},
        disconnect(){socket.connected=false;handlers.get('disconnect')?.();return socket;},
        emit(e:string,...args:any[]){handlers.get(e)?.(...args);return socket;}};
    qa().socket=socket;return socket;
}
