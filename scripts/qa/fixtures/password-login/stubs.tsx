import React from 'react';
import {captureOAuthCallback} from '../../../../src/lib/oauthLoginIntent';
import {emptyCampaign} from '../../../../src/config/campaign';
const qa=()=>((window as any).qa??={});
const listeners=new Set<(event:string,session:unknown)=>void>();
export const oauthCallbackAtStartup=captureOAuthCallback();
export const supabase={auth:{
    async initialize(){return {error:null};},
    async getSession(){return {data:{session:null},error:null};},
    async getUser(){return {data:{user:null},error:null};},
    onAuthStateChange(fn:(event:string,session:unknown)=>void){listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};},
    async signInWithOAuth(){throw new Error('OAuth is outside this password-login fixture');},
    async signOut(){listeners.forEach(fn=>fn('SIGNED_OUT',null));return {error:null};},
},from:()=>{throw new Error('Unexpected direct database access');}};
export const useAppPlatform=()=>({android:false,webContent:true,nativeServices:false});
export const useNativeAuthLinks=()=>({failed:false,dismiss:()=>{}});
export const useCampaignProgress=()=>({progress:emptyCampaign(),update:()=>{},loaded:true});
export const useFoundersRewards=()=>({available:false});
export const soundManager={getConfig:()=>({bgmVolume:0,seVolume:0}),subscribe:()=>()=>{},resumeBGM(){},playBGM(){},stopBGM(){},updateConfig(){}};
export const recordVisit=()=>{};
export const LevelSelect=({user,onBack,onOnlineMatch}:any)=><section data-testid="lobby" data-user={user.id}><p>{user.name}</p><button onClick={onBack}>Fixture logout</button><button onClick={()=>onOnlineMatch('fixture-finished-match','white','ranked','10m')}>Fixture match</button></section>;
export const GameBoard=({user,roomId,onHome}:any)=><section data-testid="match" data-user={user.id} data-room={roomId}><button onClick={onHome}>Fixture finish and home</button></section>;
export const Link=({children,...props}:any)=><a {...props}>{children}</a>;
export const Empty=()=>null;
export function io(_url:string,options:any){
    const handlers=new Map<string,(...args:any[])=>void>();
    const socket={auth:options.auth,connected:false,on:(event:string,fn:(...args:any[])=>void)=>{handlers.set(event,fn);return socket;},
        connect(){socket.connected=true;handlers.get('connect')?.();return socket;},
        disconnect(){socket.connected=false;handlers.get('disconnect')?.();return socket;},
        emit(){return socket;}};
    qa().socket=socket;return socket;
}
