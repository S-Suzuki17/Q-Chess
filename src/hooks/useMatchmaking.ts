'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../lib/SocketContext';
import type { User } from '../types/game';
import { cpuOpponent, type MatchedRoom, type QueueMode } from '../lib/rankedProtocol';

export function useMatchmaking(user:User|null) {
    const [isSearching,setIsSearching]=useState(false);
    const [matchedRoom,setMatchedRoom]=useState<MatchedRoom|null>(null);
    const [error,setError]=useState<string|null>(null);
    const [errorMessage,setErrorMessage]=useState<string|null>(null);
    const [waitTime,setWaitTime]=useState(0);
    const [clockNow,setClockNow]=useState(0);
    const [cpuFallbackAt,setCPUFallbackAt]=useState<number|null>(null);
    const timer=useRef<ReturnType<typeof setInterval>|null>(null);
    const active=useRef<{mode:QueueMode;timeControl:number;startedAt:number}|null>(null);
    const {socket,isConnected,isAuthenticated,connectionError}=useSocket();
    const stopTimer=useCallback(()=>{if(timer.current){clearInterval(timer.current);timer.current=null;}},[]);
    const stop=useCallback(()=>{active.current=null;stopTimer();setIsSearching(false);},[stopTimer]);

    useEffect(()=>{
        if(!socket)return;
        const found=(data:{matchId?:string;hostId?:string;joinerId?:string;timeControl?:number;mode?:QueueMode;cpu?:unknown})=>{
            const search=active.current;
            if(!search||typeof data.matchId!=='string'||typeof data.hostId!=='string'||typeof data.joinerId!=='string'||
                (data.hostId!==user?.id&&data.joinerId!==user?.id)||![10,180,600].includes(data.timeControl??0))return;
            const room:MatchedRoom={id:data.matchId,hostId:data.hostId,joinerId:data.joinerId,timeControl:data.timeControl!,myColor:data.hostId===user?.id?'white':'black',mode:data.mode==='ranked'?'ranked':data.mode==='random'?'random':search.mode,cpu:cpuOpponent(data.cpu)};
            stop();setError(null);setErrorMessage(null);setMatchedRoom(room);
            socket.emit('connect_match',{matchId:room.id,userName:user?.name,introVersion:1});
        };
        const joined=(data:{mode?:QueueMode;timeControl?:number;cpuFallbackAt?:number|null})=>{
            const search=active.current;
            if(!search||data.mode!==search.mode||data.timeControl!==search.timeControl)return;
            setCPUFallbackAt(search.mode==='ranked'&&typeof data.cpuFallbackAt==='number'&&Number.isFinite(data.cpuFallbackAt)?data.cpuFallbackAt:null);
        };
        const failed=(data?:{code?:string;message?:string})=>{if(!active.current)return;stop();setMatchedRoom(null);setError(data?.code||'QUEUE_FAILED');setErrorMessage(typeof data?.message==='string'&&data.message!==data.code?data.message.slice(0,300):null);};
        const disconnected=()=>{if(active.current)failed({code:'CONNECTION_FAILED'});};
        socket.on('match_found',found);socket.on('queue_joined',joined);socket.on('queue_error',failed);socket.on('match_cancelled',failed);socket.on('disconnect',disconnected);
        return()=>{socket.off('match_found',found);socket.off('queue_joined',joined);socket.off('queue_error',failed);socket.off('match_cancelled',failed);socket.off('disconnect',disconnected);};
    },[socket,user?.id,user?.name,stop]);

    const startMatchmaking=useCallback((timeControl=600,mode:QueueMode='random')=>{
        if(!user){setError('AUTH_REQUIRED');return false;}
        if(mode==='ranked'&&!isAuthenticated){setError('AUTH_REQUIRED');return false;}
        if(!socket||!isConnected){setError(connectionError||'CONNECTION_FAILED');return false;}
        if(active.current)return false;
        stopTimer();setError(null);setErrorMessage(null);setMatchedRoom(null);setWaitTime(0);setIsSearching(true);
        const startedAt=Date.now();active.current={mode,timeControl,startedAt};
        setClockNow(startedAt);
        setCPUFallbackAt(mode==='ranked'?startedAt+60000:null);
        socket.emit('join_queue',{timeControl,userName:user.name,mode});
        timer.current=setInterval(()=>{if(active.current){const now=Date.now();setClockNow(now);setWaitTime(Math.max(0,now-active.current.startedAt));}},1000);
        return true;
    },[user,socket,isConnected,isAuthenticated,connectionError,stopTimer]);
    const cancelMatchmaking=useCallback(()=>{if(active.current)socket?.emit('cancel_queue');stop();setMatchedRoom(null);setError(null);setErrorMessage(null);setCPUFallbackAt(null);},[socket,stop]);
    useEffect(()=>()=>{if(active.current)socket?.emit('cancel_queue');active.current=null;stopTimer();},[socket,stopTimer]);
    return {isSearching,matchedRoom,error,errorMessage,waitTime,clockNow,cpuFallbackAt,startMatchmaking,cancelMatchmaking,resetMatch:()=>setMatchedRoom(null)};
}
