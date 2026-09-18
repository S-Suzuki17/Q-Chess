'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession, RANKED_SESSION_EVENT } from './rankedSession';

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
        let disposed=false,revision=0,current:Socket|null=null,lastToken:string|undefined;
        let expiryTimer:ReturnType<typeof setTimeout>|undefined;
        let refreshTimer:ReturnType<typeof setTimeout>|undefined;
        setSocket(null);setIsConnected(false);setIsAuthenticated(false);setConnectionError(null);setQueueStats({});
        if(!userId){setAuthPending(false);return;}

        const refresh=async()=>{
            const request=++revision;
            setAuthPending(true);
            try {
                const proof=readRankedSession(userId);
                let token=proof?.token,expiresAt=proof?.expiresAt;
                const guest=userId.startsWith('GUEST-');
                if(guest)token=userId;
                else if(!token){
                    const {data,error}=await supabase.auth.getSession();
                    const session=data.session;
                    if(!error&&session?.user.id===userId&&!session.user.is_anonymous){
                        token=session.access_token;expiresAt=session.expires_at?session.expires_at*1000:undefined;
                    }
                }
                if(disposed||request!==revision)return;
                clearTimeout(expiryTimer);
                if(!token || (!guest&&expiresAt!==undefined&&expiresAt<=Date.now())){
                    current?.disconnect();current=null;setSocket(null);setIsConnected(false);setIsAuthenticated(false);setConnectionError('AUTH_REQUIRED');return;
                }
                const authenticated=!guest;
                if(current){
                    current.auth={token,userId};
                    // The server validates the handshake token on each rated queue.
                    if(lastToken!==token){current.disconnect();current.connect();}
                    else if(current.connected){setIsAuthenticated(authenticated);setConnectionError(null);}
                    else current.connect();
                }else{
                    const next=io(gameServerUrl(),{
                        auth:{token,userId},autoConnect:false,transports:['websocket','polling'],
                        reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000,reconnectionDelayMax:5000,
                    });
                    current=next;setSocket(next);
                    next.on('connect',()=>{if(!disposed){setIsConnected(true);setIsAuthenticated(authenticated);setConnectionError(null);}});
                    next.on('disconnect',()=>{if(!disposed){setIsConnected(false);setIsAuthenticated(false);}});
                    next.on('connect_error',(error:Error)=>{if(!disposed){setIsConnected(false);setIsAuthenticated(false);setConnectionError(/auth|token|session/i.test(error.message)?'AUTH_REQUIRED':'CONNECTION_FAILED');}});
                    next.on('queue_stats',(stats:Record<number,number>)=>{if(!disposed)setQueueStats(stats);});
                    next.connect();
                }
                lastToken=token;
                // Expiry prevents new rated queues. Do not interrupt an existing match.
                if(authenticated&&expiresAt)expiryTimer=setTimeout(()=>{if(!disposed)setIsAuthenticated(false);},Math.min(2147483647,Math.max(0,expiresAt-Date.now())));
            }catch{
                if(!disposed&&request===revision){setConnectionError('AUTH_REQUIRED');setIsAuthenticated(false);}
            }finally{if(!disposed&&request===revision)setAuthPending(false);}
        };
        const requestRefresh=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh(),0);};
        window.addEventListener(RANKED_SESSION_EVENT,requestRefresh);
        const {data:{subscription}}=supabase.auth.onAuthStateChange(requestRefresh);
        void refresh();
        return()=>{disposed=true;revision++;clearTimeout(expiryTimer);clearTimeout(refreshTimer);window.removeEventListener(RANKED_SESSION_EVENT,requestRefresh);subscription.unsubscribe();current?.disconnect();};
    },[userId]);
    return <SocketContext.Provider value={{socket,isConnected,isAuthenticated,authPending,connectionError,queueStats}}>{children}</SocketContext.Provider>;
}
