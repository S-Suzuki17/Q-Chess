import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({error:'INSUFFICIENT_FUNDS' as string|null,isConnected:true,isAuthenticated:true,connectionError:null as string|null,isSearching:false}));
vi.mock('../lib/SocketContext',()=>({useSocket:()=>({...h,authPending:false})}));
vi.mock('../hooks/useMatchmaking',()=>({useMatchmaking:()=>({isSearching:h.isSearching,matchedRoom:null,error:h.error,errorMessage:null,
    waitTime:10000,startMatchmaking:()=>{},cancelMatchmaking:()=>{}})}));
vi.mock('../lib/currentAccountTerms', () => ({
    hasLocalTermsConsent: () => true,
    CURRENT_TERMS_ACCEPTED_EVENT: 'current-terms-accepted',
}));
import { RankedMatchmakingManager } from './RankedMatchmakingManager';
const render=()=>renderToStaticMarkup(React.createElement(RankedMatchmakingManager,{lang:'ja',user:{id:'Alice',name:'Alice',type:'registered'},
    onMatchFound:()=>{},cancelSearchGlobally:()=>{},onRequestLogin:()=>{},timeControlTarget:600,mode:'ranked'}));
beforeEach(()=>Object.assign(h,{error:null,isConnected:true,isAuthenticated:true,connectionError:null,isSearching:false}));
it.each([true,false])('shows a retryable outage instead of a password request (connected=%s)',connected=>{
    Object.assign(h,{isConnected:connected,isAuthenticated:false,connectionError:'AUTH_UNAVAILABLE',error:'AUTH_UNAVAILABLE'});
    const html=render();expect(html).not.toContain('パスワード');expect(html).not.toContain('レート戦のログイン確認');
    expect(html).toContain('再試行');expect(html).toContain('role="alert"');
});
it('requests login only after a definite denial',()=>{
    Object.assign(h,{isConnected:false,isAuthenticated:false,connectionError:'AUTH_REQUIRED'});
    expect(render()).toContain('パスワード');expect(render()).toContain('レート戦のログイン確認');
});
it('shows the actual limit instead of searching, preparing, or retrying a depleted account',()=>{
    h.error='INSUFFICIENT_FUNDS'; const html=render();
    expect(html).toContain('ランク戦の対局制限に達しました');
    expect(html).toContain('日本時間9時');
    expect(html).not.toContain('再試行');
    expect(html).not.toContain('対戦相手を準備');
    expect(html).not.toContain('10秒間');
});
it('displays the searching clock during matchmaking without showing fallback warnings or countdowns',()=>{
    h.isSearching=true;
    const html=render();
    expect(html).toContain('00:10');
    expect(html).not.toContain('10秒間');
    expect(html).not.toContain('対戦相手を準備');
    expect(html).not.toContain('10s');
});
it('retains retry for a recoverable queue error',()=>{
    h.error='CONNECTION_FAILED'; const html=render();
    expect(html).not.toContain('対局制限に達しました');
    expect(html).toContain('再試行');
});


it.each(['CPU_PRACTICE_PENDING','HINT_PURCHASE_PENDING','SERVICE_UNAVAILABLE','SHARED_MATCH_UNAVAILABLE',
    'ACCOUNT_BUSY','RANKED_UNAVAILABLE','RATING_UNAVAILABLE','AUTH_UNAVAILABLE','QUEUE_BUSY','CONNECTION_FAILED'])(
    'identifies the failed stage and offers retry for %s',code=>{
        h.error=code;
        const html=render();
        expect(html).toContain('対局を開始できませんでした');
        expect(html).toContain('data-queue-error-code="'+code+'"');
        expect(html).toContain('サポートコード');
        expect(html).toContain('再試行');
        expect(html).not.toContain('対戦相手を探しています');
    });
it('does not expose unexpected server strings as a support code',()=>{
    h.error='unexpected_account_or_secret';
    const html=render();expect(html).toContain('data-queue-error-code="QUEUE_FAILED"');
    expect(html).not.toContain('unexpected_account_or_secret');
});
it('offers an explicit connection retry while disconnected',()=>{
    Object.assign(h,{error:null,isConnected:false,isAuthenticated:false,connectionError:'CONNECTION_FAILED'});
    expect(render()).toContain('再試行');
    expect(render()).toContain('data-queue-error-code="CONNECTION_FAILED"');
});

it.each([null,'CONNECTION_FAILED'])('requests fresh sign-in for a replaced session, including a simultaneous disconnect (%s)',error=>{
    Object.assign(h,{error,isConnected:false,isAuthenticated:false,connectionError:'SESSION_REPLACED'});
    const html=render();expect(html).toContain('data-queue-error-code="SESSION_REPLACED"');
    expect(html).toContain('別のタブや端末');expect(html).toContain('レート戦のログイン確認');
    expect(html).not.toContain('QUEUE_FAILED');expect(html).not.toContain('再試行');
});
it.each(['ACCOUNT_BUSY','QUEUE_BUSY'])('gives a next action for %s',code=>{
    h.error=code;expect(render()).toContain('進行中の対局や別のタブを確認');
});
it('points to retrying the match information request',()=>{
    h.error='RATING_UNAVAILABLE';expect(render()).toContain('対局情報を取得できませんでした');
});
