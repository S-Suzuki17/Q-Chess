import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {TermsGate} from '../../src/components/TermsGate';
import {TERMS_VERSION} from '../../src/config/terms';
import {model} from './terms-mock';
import '../../src/app/globals.css';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const host=document.getElementById('root');
host.innerHTML='<header style="padding:16px;background:#eee;color:#111"><button id="run">Run regression suite</button><pre id="report">Local fixtures only. No real account or network calls.</pre></header><div id="stage"></div>';
const stage=document.getElementById('stage'),root=createRoot(stage),report=document.getElementById('report');
const user=id=>({id,name:id,type:'registered'});
let epoch=0,ready=0,exits=0;
const assert=(value,label)=>{if(!value)throw new Error(label);};
const render=async(u,playing,key)=>{await act(async()=>root.render(<TermsGate key={key} user={u} lang="ja" playing={playing} onExit={()=>exits++} onReady={()=>ready++}><p data-game>GAME READY</p></TermsGate>));};
const show=async(u=user('A'),playing=false)=>render(u,playing,++epoch);
const settle=async(error)=>{const req=model.pending.shift();assert(req,'pending request exists');await act(async()=>{if(error)req.reject(new Error(error));else req.resolve(model.saved.has(req.id));});};
const noForm=()=>!stage.querySelector('[data-terms-checkbox], [data-terms-accept], article');
const loading=()=>{assert(stage.querySelector('[data-terms-loading]'),'neutral loading');assert(noForm(),'no terms while checking');assert(!stage.querySelector('[data-game]'),'no unverified access');};
const accept=async()=>{await act(async()=>stage.querySelector('[data-terms-checkbox]').click());await act(async()=>stage.querySelector('[data-terms-accept]').click());};
document.getElementById('run').onclick=async()=>{
    const results=[];const pass=label=>{results.push('PASS '+label);report.textContent=results.join('\n');};
    try{
        model.saved.clear();model.pending=[];model.writes=0;model.failWrite=false;ready=0;exits=0;
        await show();loading();await settle();assert(stage.querySelector('[data-terms-accept]').disabled,'requires explicit check');await accept();assert(stage.querySelector('[data-game]'),'accepted opens game');pass('first consent, explicit checkbox, one write');
        await show();loading();await settle();assert(stage.querySelector('[data-game]'),'reload restores consent');assert(model.writes===1,'no duplicate acceptance');pass('reload/re-login: no consent flash or second acceptance');
        await show(user('B'));loading();await settle();assert(stage.querySelector('[data-terms-accept]'),'other account still needs consent');pass('account B cannot inherit account A consent');
        await show();await settle('UNAVAILABLE');assert(noForm()&&stage.querySelector('[role=alert]'),'network error is not consent request');assert(!stage.querySelector('[data-game]'),'error fails closed');await act(async()=>stage.querySelector('[role=alert] button').click());loading();await settle();assert(stage.querySelector('[data-game]'),'retry returns to saved game');pass('network failure + retry retains accepted state');
        await show();await settle('TERMS_UPDATED');assert(noForm()&&stage.textContent.includes('最新版'),'updated version blocks old client');pass('updated terms require latest client, no old-version acceptance');
        await show(user('B'));await settle();model.failWrite=true;await accept();assert(!stage.querySelector('[data-game]')&&stage.querySelector('[role=alert]'),'failed write cannot pass');model.failWrite=false;pass('save failure cannot grant access');
        await show();await show(user('B'));await settle();loading();await settle();assert(stage.querySelector('[data-terms-accept]'),'stale A response cannot accept B');pass('late response from unmounted account ignored');
        localStorage.setItem('qg_guest_terms',TERMS_VERSION);await show({id:'GUEST-QA',name:'Guest',type:'guest'});assert(stage.querySelector('[data-game]'),'guest consent survives remount');localStorage.removeItem('qg_guest_terms');pass('guest current-version consent retained');
        await show();loading();await act(async()=>stage.querySelector('button').click());assert(exits===1,'can exit loading');await settle();pass('slow check can be exited');
        await show(user('A'),true);assert(stage.querySelector('[data-game]'),'active match remains visible');await settle();await render(user('A'),false,epoch);assert(stage.querySelector('[data-game]')&&noForm(),'accepted match exit never shows terms');pass('ranked match win -> menu keeps accepted account ready');
        await show(user('A'),true);await render(user('A'),false,epoch);loading();await settle();assert(stage.querySelector('[data-game]')&&noForm(),'slow match-exit check never shows terms');pass('ranked match exit with delayed status: no document flash');
        // Leave a deliberately pending request for visual layout inspection.
        await show();loading();report.textContent=results.join('\n')+'\n11/11 PASS — neutral loading shown below';
    }catch(error){report.textContent=results.join('\n')+'\nFAIL '+error.message;console.error(error);}
};
