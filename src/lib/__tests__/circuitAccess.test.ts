import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe,expect,it,vi } from 'vitest';
import { createCircuitAccessStore, isSameCircuitIdentity } from '../circuitAccess';
import { createCampaignStore } from '../campaignStore';
import { emptyCampaign } from '../../config/campaign';
import { finishStage } from '../../config/circuitStages';
import { CircuitLoginGate } from '../../components/CircuitLoginGate';
import { circuitAccessText } from '../../locales/circuitAccessText';
import { LANGUAGES } from '../../locales/dict';
import type { User } from '../../types/game';

const member:User={id:'member-a',name:'A',type:'registered'};
const guest:User={id:'GUEST-12',name:'Guest',type:'guest'};
describe('Crown Circuit login requirement',()=>{
    it('does not accept a guest or cached registered identity without a completed login',()=>{
        const access=createCircuitAccessStore();
        expect(access.canPlay(null)).toBe(false);expect(access.canPlay(guest)).toBe(false);expect(access.canPlay(member)).toBe(false);
        for(const user of [guest,{...guest,type:'registered' as const},{...member,id:''},{...member,id:'  '}])expect(access.grant(user,access.beginAuthentication())).toBe(false);
    });
    it('grants only the identity from a successful current authentication attempt',()=>{
        const access=createCircuitAccessStore(),attempt=access.beginAuthentication();
        expect(access.grant(member,attempt)).toBe(true);expect(access.canPlay(member)).toBe(true);
        expect(access.canPlay({...member,id:'member-b'})).toBe(false);
        expect(access.grant(member,attempt)).toBe(false); // A consumed attempt is not reusable.
        expect(createCircuitAccessStore().canPlay(member)).toBe(false); // Page reload requires revalidation.
    });
    it('ignores late profile/login responses after logout or a newer login',()=>{
        const access=createCircuitAccessStore(),oldAttempt=access.beginAuthentication();
        access.revoke();expect(access.grant(member,oldAttempt)).toBe(false);
        const next=access.beginAuthentication(),newest=access.beginAuthentication();
        expect(access.grant(member,next)).toBe(false);
        expect(access.grant({...member,id:'member-b'},newest)).toBe(true);
        expect(access.grant(member,oldAttempt)).toBe(false);
    });
    it('distinguishes appearance updates from account replacement, removal and malformed cache',()=>{
        const before=JSON.stringify(member);
        expect(isSameCircuitIdentity(before,JSON.stringify({...member,name:'New name',avatar_url:'/new.png'}))).toBe(true);
        for(const next of [null,'invalid','null','{}',JSON.stringify({...member,id:'member-b'}),JSON.stringify({...member,type:'guest'})])expect(isSameCircuitIdentity(before,next)).toBe(false);
        expect(isSameCircuitIdentity(null,before)).toBe(false);
        expect(isSameCircuitIdentity('invalid',before)).toBe(false);
    });
    it('revokes an in-flight result/ad continuation even if the same account logs back in',()=>{
        const access=createCircuitAccessStore();access.grant(member,access.beginAuthentication());
        const permit=access.permit(member);expect(permit()).toBe(true);
        access.revoke();expect(permit()).toBe(false);
        access.grant(member,access.beginAuthentication());expect(permit()).toBe(false);
        expect(access.permit(member)()).toBe(true);
    });
    it('preserves old save bytes while blocking unauthenticated advancement',()=>{
        const access=createCircuitAccessStore();
        let raw=JSON.stringify({...emptyCampaign(),stageStars:[3,2],avatar:'standard'});
        const before=raw,setItem=vi.fn((_key:string,value:string)=>{raw=value;});
        const store=createCampaignStore(()=>({getItem:()=>raw,setItem}));store.load();
        const victory={won:true,draw:false,playerMoves:10,hintsUsed:0,initialSeconds:10,remainingSeconds:7};
        const complete=()=>{if(access.canPlay(member))store.update(value=>finishStage(value,3,victory));};
        complete();expect(raw).toBe(before);expect(setItem).not.toHaveBeenCalled();
        access.grant(member,access.beginAuthentication());complete();expect(store.getSnapshot().progress.stageStars).toEqual([3,2,3]);
        const saved=raw;access.revoke();complete();expect(raw).toBe(saved);
    });
    it('notifies subscribers on login and revocation with a stable snapshot between changes',()=>{
        const access=createCircuitAccessStore(),listener=vi.fn(),unsubscribe=access.subscribe(listener),first=access.getSnapshot();
        expect(access.getSnapshot()).toBe(first);
        const attempt=access.beginAuthentication();access.grant(member,attempt);access.revoke();
        expect(listener).toHaveBeenCalledTimes(3);unsubscribe();access.revoke();expect(listener).toHaveBeenCalledTimes(3);
        expect(access.getServerSnapshot().userId).toBeNull();
    });
    it.each(LANGUAGES.map(language=>language.code))('provides a clear login action without mounting a playable board in %s',lang=>{
        const html=renderToStaticMarkup(createElement(CircuitLoginGate,{lang,onLogin:()=>{},onBack:()=>{}}));
        expect(html).toContain(circuitAccessText(lang,'help'));expect(html).toContain(circuitAccessText(lang,'action'));
        expect(html).toContain('data-testid="circuit-login-gate"');expect(html).not.toContain('<canvas');expect(html).not.toContain('data-stage=');
    });
    it('keeps entry, stage start, result, delayed next-stage and identity replacement guarded',()=>{
        const source=readFileSync('src/components/CampaignMode.tsx','utf8');
        expect(source).toContain('if(!allowed)return <CircuitLoginGate');
        expect(source).toContain('key={`${props.user.id}:${revision}`}');
        expect(source).toContain('!runPermit.current?.()');
        expect(source).toContain('if(!circuitAccess.canPlay(user)||!loaded');
        expect(source).toContain('if(permit()&&runPermit.current===permit)action()');
        expect(source).toContain('const leaveStage=()=>{runPermit.current=null;');
        const page=readFileSync('src/app/page.tsx','utf8');
        expect(page).toContain('await supabase.auth.getUser()');
        expect(page).toContain('verified.is_anonymous');
        expect(page).toContain('!circuitAccess.grant(u,attempt)');
        expect(page).toContain('storage\',identityChanged');
        const restore=page.slice(page.indexOf("const lastUser = localStorage.getItem('qg_last_user')"),page.indexOf('const handleLogin'));
        expect(restore).not.toContain('circuitAccess.grant');
    });
});
