'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession, readRankedSessionCandidate, rankedSessionRemainingMs,
    rankedSessionRevision, forgetRevokedRankedSession, RANKED_SESSION_EVENT, type RankedSession } from './rankedSession';
import {clientRelease} from './clientRelease';

interface SocketContextProps {
    socket: Socket | null;
    isConnected: boolean;
    isAuthenticated: boolean;
    authPending: boolean;
    connectionError: string | null;
    queueStats: Record<number, number>;
}
const SocketContext = createContext<SocketContextProps>({ socket:null, isConnected:false, isAuthenticated:false, authPending:false, connectionError:null, queueStats:{} });
export function useSocket() { return useContext(SocketContext); }

/** The server verifies the token. Cached profile IDs alone never authenticate a socket. */
export function SocketProvider({ children, userId }: { children:React.ReactNode; userId:string|undefined }) {
    const [socket,setSocket]=useState<Socket|null>(null);
    const [isConnected,setIsConnected]=useState(false);
    const [isAuthenticated,setIsAuthenticated]=useState(false);
    const [authPending,setAuthPending]=useState(false);
    const [connectionError,setConnectionError]=useState<string|null>(null);
    const [queueStats,setQueueStats]=useState<Record<number,number>>({});

    useEffect(()=>{
        let disposed=false,superseded=false,revision=0,current:Socket|null=null,lastToken:string|undefined;
        let lastProof:RankedSession|null=null;
        let expiryTimer:ReturnType<typeof setTimeout>|undefined;
        let refreshTimer:ReturnType<typeof setTimeout>|undefined;
        setSocket(null);setIsConnected(false);setIsAuthenticated(false);setConnectionError(null);setQueueStats({});
        if(!userId){setAuthPending(false);return;}

        const refresh=async()=>{
            // A background token refresh must not steal a match back from the
            // device the user just switched to. Explicit re-login can reclaim it.
            if(superseded||disposed)return;
            const request=++revision;
            setAuthPending(true);
            try {
                const proof=readRankedSession(userId);
                const proofRevision=rankedSessionRevision();
                const candidate=readRankedSessionCandidate(userId);
                // Background auth events must not interrupt a match merely
                // because its legacy proof expired after the handshake.
                if(current?.connected&&lastProof&&candidate?.token===lastProof.token&&
                    candidate.expiresAt===lastProof.expiresAt&&rankedSessionRemainingMs(candidate)<=0){
                    clearTimeout(expiryTimer);setIsAuthenticated(false);return;
                }
                let token=proof?.token,remainingMs=proof?rankedSessionRemainingMs(proof):undefined;
                const guest=userId.startsWith('GUEST-');
                if(guest)token=userId;
                else if(!token){
                    const {data,error}=await supabase.auth.getSession();
                    const session=data.session;
                    if(!error&&session?.user.id===userId&&!session.user.is_anonymous){
                        token=session.access_token;remainingMs=session.expires_at?session.expires_at*1000-Date.now():undefined;
                    }
                }
                if(disposed||superseded||request!==revision)return;
                clearTimeout(expiryTimer);
                if(!token || (!guest&&remainingMs!==undefined&&remainingMs<=0)){
                    current?.disconnect();current=null;setSocket(null);setIsConnected(false);setIsAuthenticated(false);setConnectionError('AUTH_REQUIRED');return;
                }
                const authenticated=!guest;
                // A fresh transport binds notices to an immutable handshake.
                // Reusing one across tokens makes a delayed revocation ambiguous.
                if(current&&(lastToken!==token||lastProof?.token!==proof?.token||lastProof?.expiresAt!==proof?.expiresAt)){
                    const previous=current;current=null;previous.disconnect();
                    setIsConnected(false);setIsAuthenticated(false);
                }
                lastToken=token;lastProof=proof;
                if(current){
                    if(current.connected){setIsAuthenticated(authenticated);setConnectionError(null);}
                    else current.connect();
                }else{
                    const next=io(gameServerUrl(),{
                        auth:{token,userId,client:clientRelease},autoConnect:false,transports:['websocket','polling'],
                        reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000,reconnectionDelayMax:5000,
                    });
                    current=next;setSocket(next);
                    const ownsSocket=()=>!disposed&&current===next;
                    const active=()=>ownsSocket()&&!superseded;
                    const stop=(error:string)=>{
                        superseded=true;revision++;clearTimeout(expiryTimer);clearTimeout(refreshTimer);
                        next.disconnect();setIsConnected(false);setIsAuthenticated(false);setAuthPending(false);
                        setQueueStats({});setConnectionError(error);
                    };
                    next.on('connect',()=>{if(active()){
                        setIsConnected(true);setIsAuthenticated(authenticated&&(!proof||rankedSessionRemainingMs(proof)>0));setConnectionError(null);
                    }});
                    next.on('disconnect',()=>{if(ownsSocket()){setIsConnected(false);setIsAuthenticated(false);}});
                    next.on('session_replaced',()=>{if(active())stop('SESSION_REPLACED');});
                    next.on('session_revoked',(notice:unknown)=>{
                        if(!active()||!proof||!notice||typeof notice!=='object'||
                            (notice as {reason?:unknown}).reason!=='revoked')return;
                        if(forgetRevokedRankedSession(proof,proofRevision))stop('AUTH_REQUIRED');
                    });
                    next.on('connect_error',(error:Error)=>{if(active()){setIsConnected(false);setIsAuthenticated(false);setConnectionError(/auth|token|session/i.test(error.message)?'AUTH_REQUIRED':'CONNECTION_FAILED');}});
                    next.on('queue_stats',(stats:Record<number,number>)=>{if(active())setQueueStats(stats);});
                    next.connect();
                }
                // Expiry prevents new rated queues. Do not interrupt an existing match.
                if(authenticated&&remainingMs!==undefined){
                    const expire=()=>{
                        if(disposed)return;
                        const left=proof?rankedSessionRemainingMs(proof):0;
                        if(left>0)expiryTimer=setTimeout(expire,Math.min(2147483647,left));
                        else setIsAuthenticated(false);
                    };
                    expiryTimer=setTimeout(expire,Math.min(2147483647,Math.max(0,remainingMs)));
                }
            }catch{
                if(!disposed&&request===revision){setConnectionError('AUTH_REQUIRED');setIsAuthenticated(false);}
            }finally{if(!disposed&&request===revision)setAuthPending(false);}
        };
        const requestRefresh=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh(),0);};
        const explicitLogin=()=>{
            const proof=readRankedSession(userId);
            if(proof&&proof.token!==lastToken)superseded=false;
            requestRefresh();
        };
        window.addEventListener(RANKED_SESSION_EVENT,explicitLogin);
        const {data:{subscription}}=supabase.auth.onAuthStateChange(requestRefresh);
        void refresh();
        return()=>{disposed=true;revision++;clearTimeout(expiryTimer);clearTimeout(refreshTimer);window.removeEventListener(RANKED_SESSION_EVENT,explicitLogin);subscription.unsubscribe();current?.disconnect();};
    },[userId]);
    return <SocketContext.Provider value={{socket,isConnected,isAuthenticated,authPending,connectionError,queueStats}}>{children}</SocketContext.Provider>;
}
