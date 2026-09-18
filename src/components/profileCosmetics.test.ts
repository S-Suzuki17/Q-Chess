import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { badgeFromRating, PROFILE_BADGES } from '../config/profileBadges';
import { badgeName, cosmeticsText } from '../locales/profileCosmeticsText';
import { LANGUAGES } from '../locales/dict';
import { getTitleFromRating } from '../lib/rankSystem';
import { AccountAvatar } from './AccountAvatar';
import { RankBadgeArtwork } from './RankBadgeArtwork';
import { ProfileCosmetics } from './ProfileCosmetics';

describe('Profile rank cosmetics',()=>{
    it.each([null,undefined,NaN,Infinity,-Infinity,-1,0,1199.999])('never grants a badge for unavailable or below-threshold rating %s',rating=>{
        expect(badgeFromRating(rating)).toBeNull();
    });
    it.each(PROFILE_BADGES)('resolves $id at its threshold without rounding up',badge=>{
        expect(badgeFromRating(badge.minimum)?.id).toBe(badge.id);
        expect(badgeFromRating(badge.minimum+.99)?.id).toBe(badge.id);
        expect(badgeFromRating(badge.minimum-.01)?.id).not.toBe(badge.id);
    });
    it('preserves Master at 2400 and the pre-existing lowest rank',()=>{
        expect(badgeFromRating(10000)?.id).toBe('king');
        expect(getTitleFromRating(1199).name).toBe('Novice');
        expect(getTitleFromRating(2100).name).toBe('Platinum');
        expect(getTitleFromRating(2250).name).toBe('Diamond');
        expect(getTitleFromRating(2400).name).toBe('Master');
    });
    it.each(LANGUAGES.map(l=>l.code))('provides all six names and controls in %s',lang=>{
        const names=PROFILE_BADGES.map(b=>badgeName(lang,b.id));
        expect(new Set(names).size).toBe(6);
        expect(names.every(name=>typeof name==='string'&&name.length>0)).toBe(true);
        for(const key of ['title','current','preview','reset','rule','unranked','unavailable','threshold','gallery','motion','fallback'] as const)expect(cosmeticsText(lang,key)).toBeTruthy();
    });
    it('keeps compact avatars Canvas-free and preserves the actual portrait and frame',()=>{
        const html=renderToStaticMarkup(createElement(AccountAvatar,{name:'Player',url:'/portrait.png',frame:'avatar-frame-15',rating:2400,lang:'ja'}));
        expect(html).toContain('src="/portrait.png"');
        expect(html).toContain('data-avatar-frame="avatar-frame-15"');
        expect(html).toContain('data-rank-badge="king"');
        expect(html).toContain('キング級・マスター');
        expect(html).not.toContain('<canvas');
        expect(renderToStaticMarkup(createElement(AccountAvatar,{name:'CPU'}))).not.toContain('data-rank-badge');
    });
    it('renders six different static sculptures with independent SVG paint IDs',()=>{
        const html=renderToStaticMarkup(createElement('div',null,...PROFILE_BADGES.map(badge=>createElement(RankBadgeArtwork,{key:badge.id,badge}))));
        const ids=Array.from(html.matchAll(/linearGradient id="([^"]+)"/g),match=>match[1]);
        expect(ids).toHaveLength(6);expect(new Set(ids).size).toBe(6);
        expect(new Set(PROFILE_BADGES.map(b=>b.silhouette)).size).toBe(6);
    });
    it.each(['avatar-frame-05','avatar-frame-10','avatar-frame-15'])('keeps the %s crown symmetric above the portrait',frame=>{
        const html=renderToStaticMarkup(createElement(AccountAvatar,{name:'Player',frame}));
        const crown=html.match(/<path d="(M31 15[^"]+)"/);
        expect(crown).not.toBeNull();
        const values=crown![1].match(/-?\d+/g)!.map(Number);
        const points=Array.from({length:values.length/2},(_,i)=>[values[i*2],values[i*2+1]]);
        for(let i=0;i<points.length;i++) {
            expect(points[i][0]+points[points.length-1-i][0]).toBe(120);
            expect(points[i][1]).toBe(points[points.length-1-i][1]);
            expect(points[i][0]).toBeGreaterThanOrEqual(25);
            expect(points[i][0]).toBeLessThanOrEqual(95);
        }
    });
    it('defaults to the 10m rating, never the highest rating, and marks previews separately',()=>{
        const html=renderToStaticMarkup(createElement(ProfileCosmetics,{lang:'ja',name:'Player',ratings:{rating_10m:1800,rating_3m:2400,rating_10s:1500}}));
        expect(html).toContain('data-current-badge="bishop"');
        expect(html).not.toContain('data-current-badge="king"');
        expect(html.match(/data-preview-badge=/g)).toHaveLength(6);
        expect(html).toContain('プレビューでは装備は変わりません');
    });
    it('does not fabricate a rank when profile data is missing',()=>{
        const html=renderToStaticMarkup(createElement(ProfileCosmetics,{lang:'ja',name:'Guest'}));
        expect(html).toContain('data-current-badge="none"');expect(html).toContain('レート未取得');
        expect(html).not.toContain('profile-badge-canvas');
    });
    it('keeps previews local, scene lazy, animation bounded and context-loss recoverable',()=>{
        const panel=readFileSync('src/components/ProfileCosmetics.tsx','utf8'),scene=readFileSync('src/components/RankBadgeScene.tsx','utf8');
        expect(panel).not.toMatch(/localStorage|supabase|fetch\(|setItem|\.update\(/);
        expect(panel).toContain("dynamic(()=>import('./RankBadgeScene'),{ssr:false})");
        expect(panel).toContain('motion&&active&&!reduced&&visible');
        expect(scene).toContain("frameloop:animate?'always':'demand'");
        expect(scene).toContain('await owned.configure');
        expect(panel).toContain('setTimeout(onFailure,12000)');
        expect(scene).toContain("removeEventListener('webglcontextlost',lost)");
        expect(scene).not.toMatch(/DeviceOrientation|OrbitControls|PresentationControls|Audio|Sparkles/);
    });
});
