import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {LANGUAGES,dict} from '../locales/dict';
import {TermsGate} from './TermsGate';
import {currentAccountTermsStatus,acceptCurrentAccountTerms,hasLocalTermsConsent,setLocalTermsConsent} from '../lib/currentAccountTerms';

vi.mock('../lib/currentAccountTerms',()=>({
    currentAccountTermsStatus:vi.fn(),
    acceptCurrentAccountTerms:vi.fn(),
    hasLocalTermsConsent:vi.fn().mockReturnValue(false),
    setLocalTermsConsent:vi.fn(),
    clearLocalTermsConsent:vi.fn(),
}));
vi.mock('./AccountDeletionPanel',()=>({AccountDeletionPanel:()=>null}));

describe('terms gate startup',()=>{
    const user={id:'local-fixture',name:'Fixture',type:'registered' as const};
    it.each(LANGUAGES.map(({code})=>code))('never flashes the consent document before checking saved consent (%s)',lang=>{
        const html=renderToStaticMarkup(createElement(TermsGate,{user,lang,playing:false,onExit:()=>{},onReady:()=>{}},'PRIVATE GAME'));
        expect(html).toContain('data-terms-loading');
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain(dict[lang].loading);
        expect(html).not.toMatch(/data-terms-gate|data-terms-checkbox|data-terms-accept|<article|PRIVATE GAME/);
    });
    it('keeps the signed-out title and an active game accessible',()=>{
        for(const props of [{user:null,playing:false},{user,playing:true}]){
            expect(renderToStaticMarkup(createElement(TermsGate,{...props,lang:'ja',onExit:()=>{},onReady:()=>{}},'GAME'))).toBe('GAME');
        }
    });
    it('lets users with local consent reach the game directly without a loading screen',()=>{
        vi.mocked(hasLocalTermsConsent).mockReturnValueOnce(true);
        const html=renderToStaticMarkup(createElement(TermsGate,{user,lang:'ja',playing:false,onExit:()=>{},onReady:()=>{}},'READY GAME'));
        expect(html).toBe('READY GAME');
        expect(currentAccountTermsStatus).not.toHaveBeenCalled();
    });
    it.each(LANGUAGES.map(({code})=>code))('lets guests reach practice directly without a consent document (%s)',lang=>{
        const guest={id:'GUEST-reference-fixture',name:'Guest',type:'guest' as const};
        const html=renderToStaticMarkup(createElement(TermsGate,{user:guest,lang,playing:false,onExit:()=>{},onReady:()=>{}},'LOCAL PRACTICE'));
        expect(html).toBe('LOCAL PRACTICE');
        expect(currentAccountTermsStatus).not.toHaveBeenCalled();
        expect(acceptCurrentAccountTerms).not.toHaveBeenCalled();
    });
});
