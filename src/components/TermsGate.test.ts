import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {LANGUAGES,dict} from '../locales/dict';
import {TermsGate} from './TermsGate';

vi.mock('../lib/accountTerms',()=>({accountTermsStatus:vi.fn(),acceptAccountTerms:vi.fn()}));
vi.mock('./AccountDeletionPanel',()=>({AccountDeletionPanel:()=>null}));

describe('terms gate startup',()=>{
    const user={id:'local-fixture',name:'Fixture',type:'registered' as const};
    it.each(LANGUAGES.map(({code})=>code))('never flashes the consent document before checking saved consent (%s)',lang=>{
        const html=renderToStaticMarkup(createElement(TermsGate,{user,lang,playing:false,onExit:()=>{},onReady:()=>{},children:'PRIVATE GAME'}));
        expect(html).toContain('data-terms-loading');
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain(dict[lang].loading);
        expect(html).not.toMatch(/data-terms-gate|data-terms-checkbox|data-terms-accept|<article|PRIVATE GAME/);
    });
    it('keeps the signed-out title and an active game accessible',()=>{
        for(const props of [{user:null,playing:false},{user,playing:true}]){
            expect(renderToStaticMarkup(createElement(TermsGate,{...props,lang:'ja',onExit:()=>{},onReady:()=>{},children:'GAME'}))).toBe('GAME');
        }
    });
});
