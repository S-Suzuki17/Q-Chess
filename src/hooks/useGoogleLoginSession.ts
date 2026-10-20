'use client';
import {useEffect,useRef,useState} from 'react';
import {Capacitor} from '@capacitor/core';
import type {Session} from '@supabase/supabase-js';
import type {User} from '../types/game';
import {supabase,oauthCallbackAtStartup} from '../lib/supabaseClient';
import {circuitAccess} from '../lib/circuitAccess';
import {clearRankedSession} from '../lib/rankedSession';
import {clearOAuthLoginIntent,hasOAuthLoginIntent,completedOAuthCallback} from '../lib/oauthLoginIntent';
import {requireOAuthAdmission} from '../lib/oauthAdmission';
import {GoogleLoginError,readGoogleAccount,wantsGooglePasswordReset,clearGooglePasswordReset} from '../lib/googleAccount';
import {forgetGoogleAccount,rememberGoogleAccount,type GoogleAccount} from '../lib/googleAccountIdentity';

export type GoogleLoginState={status:'checking'|'signed-out'|'setup'|'reset'|'ready'|'error';authId?:string};
export function useGoogleLoginSession(onReady:(user:User)=>void,onSignedOut:()=>void) {
    const [state,setState]=useState<GoogleLoginState>({status:'checking'});
    const callbacks=useRef({onReady,onSignedOut});callbacks.current={onReady,onSignedOut};
    const scope=useRef<{controller:AbortController;attempt:number;authId:string}|null>(null);
    const accepted=useRef<string|null>(null),alive=useRef(false),suspended=useRef(false),generation=useRef(0);
    const bootstrapping=useRef(true);
    const reload=useRef<()=>void>(()=>{});
    const invalidate=()=>{
        generation.current++;scope.current?.controller.abort();scope.current=null;
        accepted.current=null;forgetGoogleAccount();
    };
    const finish=(account:GoogleAccount)=>{
        const current=scope.current;
        if(!alive.current||suspended.current||!current||current.controller.signal.aborted||current.authId!==account.authId
            ||circuitAccess.getSnapshot().revision!==current.attempt)return;
        const user:User={id:account.userId,name:account.name,type:'registered'};
        if(!circuitAccess.grant(user,current.attempt))return;
        rememberGoogleAccount(account);accepted.current=account.authId;
        clearRankedSession();clearOAuthLoginIntent();clearGooglePasswordReset();
        setState({status:'ready',authId:account.authId});callbacks.current.onReady(user);
    };
    useEffect(()=>{
        alive.current=true;
        const restore=async(session:Session|null)=>{
            if(!alive.current||suspended.current)return;
            if(session&&accepted.current===session.user.id&&!wantsGooglePasswordReset())return;
            const previous=accepted.current;invalidate();
            const request=generation.current;
            const attempt=circuitAccess.beginAuthentication(),controller=new AbortController();
            if(previous)callbacks.current.onSignedOut();
            if(!session||session.user.is_anonymous){scope.current=null;setState({status:'signed-out'});return;}
            scope.current={attempt,controller,authId:session.user.id};
            setState({status:'checking',authId:session.user.id});
            const current=()=>alive.current&&!suspended.current&&request===generation.current
                &&!controller.signal.aborted&&circuitAccess.getSnapshot().revision===attempt;
            try{
                const account=await readGoogleAccount(session.user.id,controller.signal);
                if(!current())return;
                if(!account)setState({status:'setup',authId:session.user.id});
                else if(wantsGooglePasswordReset())setState({status:'reset',authId:session.user.id});
                else {
                    if(hasOAuthLoginIntent())await requireOAuthAdmission(session.access_token,account.userId);
                    if(current())finish(account);
                }
            }catch(error){
                if(!current())return;
                setState({status:error instanceof GoogleLoginError&&error.code==='GOOGLE_REQUIRED'?'signed-out':'error',authId:session.user.id});
            }
        };
        const load=async()=>{
            suspended.current=false;bootstrapping.current=true;invalidate();const request=generation.current;
            setState({status:'checking'});
            try{
                const {error:initialError}=await supabase.auth.initialize();
                if(!alive.current||request!==generation.current)return;
                if(initialError)throw initialError;
                if(hasOAuthLoginIntent()&&!Capacitor.isNativePlatform()
                    &&!completedOAuthCallback(oauthCallbackAtStartup,initialError)){
                    suspended.current=true;clearOAuthLoginIntent();clearGooglePasswordReset();setState({status:'signed-out'});return;
                }
                const {data,error}=await supabase.auth.getSession();
                if(!alive.current||request!==generation.current)return;
                if(error)throw error;
                bootstrapping.current=false;
                await restore(data.session);
            }catch{if(alive.current&&request===generation.current)setState({status:'error'});}
        };
        reload.current=()=>{void load();};
        const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
            if(!alive.current||suspended.current)return;
            if(event==='SIGNED_OUT'){invalidate();
                circuitAccess.revoke();setState({status:'signed-out'});callbacks.current.onSignedOut();}
            else if(!bootstrapping.current&&(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')){
                // Leave the SDK's auth lock before awaiting another SDK call.
                const request=generation.current;
                setTimeout(()=>{if(alive.current&&request===generation.current)void restore(session);},0);
            }
        });
        void load();
        return()=>{alive.current=false;invalidate();subscription.unsubscribe();};
    },[]);
    return {state,finish,retry:()=>reload.current(),
        fail:()=>{invalidate();suspended.current=true;circuitAccess.revoke();setState({status:'error'});},
        start:()=>{invalidate();bootstrapping.current=false;suspended.current=false;circuitAccess.beginAuthentication();setState({status:'checking'});},
        cancel:()=>{invalidate();suspended.current=true;clearOAuthLoginIntent();
            clearGooglePasswordReset();circuitAccess.revoke();setState({status:'signed-out'});},
    };
}
