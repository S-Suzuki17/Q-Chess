import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({error:'INSUFFICIENT_FUNDS'}));
vi.mock('../lib/SocketContext',()=>({useSocket:()=>({isConnected:true,isAuthenticated:true,authPending:false,connectionError:null})}));
vi.mock('../hooks/useMatchmaking',()=>({useMatchmaking:()=>({isSearching:false,matchedRoom:null,error:h.error,errorMessage:null,
    waitTime:10000,clockNow:10000,cpuFallbackAt:10000,startMatchmaking:()=>{},cancelMatchmaking:()=>{}})}));
import { RankedMatchmakingManager } from './RankedMatchmakingManager';
const render=()=>renderToStaticMarkup(React.createElement(RankedMatchmakingManager,{lang:'ja',user:{id:'Alice',name:'Alice',type:'registered'},
    onMatchFound:()=>{},cancelSearchGlobally:()=>{},onRequestLogin:()=>{},timeControlTarget:600,mode:'ranked'}));
it('shows the actual limit instead of searching, preparing, or retrying a depleted account',()=>{
    h.error='INSUFFICIENT_FUNDS'; const html=render();
    expect(html).toContain('ランク戦の対局制限に達しました');
    expect(html).toContain('日本時間9時');
    expect(html).not.toContain('再試行');
    expect(html).not.toContain('対戦相手を準備');
    expect(html).not.toContain('10秒間');
});
it('retains retry for a recoverable queue error',()=>{
    h.error='CONNECTION_FAILED'; const html=render();
    expect(html).not.toContain('対局制限に達しました');
    expect(html).toContain('再試行');
});
