import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MatchIntro } from './MatchIntro';

describe('automatic centered match introduction',()=>{
    it.each([true,false])('keeps both accounts and ratings, without a Skip button (blocking=%s)',blocking=>{
        const html=renderToStaticMarkup(createElement(MatchIntro,{lang:'en',white:{name:'Alice',rating:1000},black:{name:'Bob',rating:1200},label:'Ranked',onDone:()=>{},blocking}));
        expect(html).toContain('Alice');expect(html).toContain('Bob');expect(html).toContain('1000');expect(html).toContain('1200');
        expect(html).not.toMatch(/<button|Skip/);
    });
    it('keeps a bounded automatic transition and cleans up its one-shot sound',()=>{
        const source=readFileSync('src/components/MatchIntro.tsx','utf8');
        expect(source).toContain('duration=3200');expect(source).toContain('setTimeout(()=>done.current(),duration)');
        expect(source).toContain('cancelAnimationFrame(soundFrame);stopSound();clearTimeout(timeout)');
        const css=readFileSync('src/components/match-intro.css','utf8');
        expect(css).toContain('position:fixed;inset:0;margin:auto');expect(css).not.toContain('right:14px;bottom:14px');
        const wav=readFileSync('public/audio/se_match_intro.wav');
        expect(wav.subarray(0,4).toString()).toBe('RIFF');expect(wav.length).toBeGreaterThan(100_000);
        let peak=0;for(let i=44;i<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));
        expect(peak/32767).toBeGreaterThan(.5);expect(peak/32767).toBeLessThan(.8);
        expect(wav.readUInt32LE(40)/wav.readUInt32LE(28)).toBeCloseTo(1.25,2);
    });
});
