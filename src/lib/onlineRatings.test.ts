import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {openingRating} from './onlineRatings';
import {MatchIntro} from '../components/MatchIntro';
describe('online opening badges',()=>{
    it('uses the server snapshot immediately, retains zero and never invents missing ratings',()=>{
        expect(openingRating('a',2250,1500)).toBe(2250);
        expect(openingRating('a',0,2000)).toBe(0);
        expect(openingRating('a',undefined,1800)).toBe(1800);
        for(const value of [undefined,null,NaN,Infinity,-1,'2400'])expect(openingRating('a',value,undefined)).toBeNull();
        for(const id of [undefined,'GUEST-a','anon_a','ai'])expect(openingRating(id,2400,2400)).toBeNull();
    });
    it('shows both readable badges alongside the opening names and ratings without extra canvases',()=>{
        const html=renderToStaticMarkup(createElement(MatchIntro,{lang:'ja',white:{name:'White QA',rating:1800},black:{name:'Black QA',rating:2400},label:'10分',onDone:()=>{}}));
        for(const text of ['White QA','Black QA','1800','2400','data-intro-badge="bishop"','data-intro-badge="king"','ビショップ級','キング級'])expect(html).toContain(text);
        expect(html).not.toContain('<canvas');
    });
    it('labels a new 1000-rated user as unranked rather than granting an unearned badge',()=>{
        const html=renderToStaticMarkup(createElement(MatchIntro,{lang:'ja',white:{name:'New',rating:1000},black:{name:'Unknown'},label:'10分',onDone:()=>{}}));
        expect(html.match(/data-intro-badge="none"/g)).toHaveLength(2);
        expect(html).toContain('レート未取得');
        expect(html).not.toContain('rank-badge-art');
    });
});
