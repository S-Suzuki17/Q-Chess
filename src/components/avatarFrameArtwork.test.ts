import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {AVATAR_FRAMES} from '../config/avatarFrames';
import {FOUNDERS_FRAME,FOUNDERS_FRAME_ID} from '../config/founders';
import {AccountAvatar} from './AccountAvatar';
import {AvatarFrameArtwork} from './AvatarFrameArtwork';

const artwork=(decoration:typeof AVATAR_FRAMES[number],animate=false)=>renderToStaticMarkup(createElement(AvatarFrameArtwork,{decoration,animate}));
const geometry=(html:string)=>Array.from(html.matchAll(/<(?:path|circle|rect)\b[^>]*>/g),match=>match[0]
    .replace(/\s(?:class|data-[\w-]+|fill|stroke|opacity|clip-path)="[^"]*"/g,'')).join('');

// These are visual-only tests; no account, reward ownership or external service calls.
describe('Quantum Coronation avatar frames',()=>{
    it('gives all fifteen rewards distinct geometry, not just different paint',()=>{
        const shapes=AVATAR_FRAMES.map(frame=>geometry(artwork(frame)));
        expect(new Set(shapes).size).toBe(15);
        for(const frame of AVATAR_FRAMES) {
            expect(artwork(frame)).toContain(`data-frame-design="${frame.motif}-${Math.ceil(frame.tier/5)}"`);
        }
    });
    it.each(['laurel','facets','wings','circuit','crown'] as const)('adds actual fittings to each successive %s grade',motif=>{
        const frames=AVATAR_FRAMES.filter(frame=>frame.motif===motif);
        const counts=frames.map(frame=>(artwork(frame).match(/<(?:path|circle)\b/g)??[]).length);
        expect(counts).toHaveLength(3);
        expect(counts[1]).toBeGreaterThan(counts[0]);
        expect(counts[2]).toBeGreaterThan(counts[1]);
    });
    it('retains recognisable motif-specific construction',()=>{
        expect(artwork(AVATAR_FRAMES[0]).match(/data-frame-leaf=/g)).toHaveLength(10);
        expect(artwork(AVATAR_FRAMES[10]).match(/data-frame-leaf=/g)).toHaveLength(18);
        expect(artwork(AVATAR_FRAMES[1]).match(/data-frame-jewel=/g)).toHaveLength(4);
        expect(artwork(AVATAR_FRAMES[6]).match(/data-frame-jewel=/g)).toHaveLength(8);
        expect(artwork(AVATAR_FRAMES[2]).match(/data-frame-fin=/g)).toHaveLength(6);
        expect(artwork(AVATAR_FRAMES[12]).match(/data-frame-fin=/g)).toHaveLength(10);
        expect(artwork(AVATAR_FRAMES[3]).match(/data-frame-node=/g)).toHaveLength(6);
        expect(artwork(AVATAR_FRAMES[8]).match(/data-frame-node=/g)).toHaveLength(10);
        const crests=[4,9,14].map(index=>artwork(AVATAR_FRAMES[index]).match(/data-frame-crest="true" d="([^"]+)"/)?.[1]);
        expect(new Set(crests).size).toBe(3);
        expect(crests.every(Boolean)).toBe(true);
    });
    it('builds dimensional faces and keeps royal regalia exclusive to the higher grades',()=>{
        for(const index of [2,7,12]) {
            const html=artwork(AVATAR_FRAMES[index]);
            const feathers=html.match(/data-frame-fin=/g)??[];
            const cutSides=html.match(/data-frame-cut-plane=/g)??[];
            expect(cutSides).toHaveLength(feathers.length);
            expect(html).toContain('stroke="#fff0cd"');
        }
        for(const index of [1,6,11])expect(artwork(AVATAR_FRAMES[index]).match(/data-frame-bevel=/g)).toHaveLength(8);
        expect(artwork(AVATAR_FRAMES[4])).not.toContain('data-frame-mantle');
        expect(artwork(AVATAR_FRAMES[9]).match(/data-frame-mantle=/g)).toHaveLength(2);
        expect(artwork(AVATAR_FRAMES[9])).not.toContain('data-frame-regalia');
        expect(artwork(AVATAR_FRAMES[14]).match(/data-frame-regalia=/g)).toHaveLength(2);
    });
    it('uses independent paint and clipping IDs for repeated frames and the founder frame',()=>{
        const frames=[...AVATAR_FRAMES,...AVATAR_FRAMES,FOUNDERS_FRAME];
        const html=renderToStaticMarkup(createElement('div',null,...frames.map((decoration,index)=>createElement(AvatarFrameArtwork,{key:index,decoration}))));
        const ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),match=>match[1]);
        const references=Array.from(html.matchAll(/url\(#([^)]+)\)/g),match=>match[1]);
        expect(ids).toHaveLength(frames.length*5);
        expect(new Set(ids).size).toBe(ids.length);
        expect(references.every(id=>ids.includes(id))).toBe(true);
        const source=readFileSync('src/components/AvatarFrameArtwork.tsx','utf8');
        expect(source).toContain('const id=useId()');
        expect(source).not.toMatch(/Math\.random|Date\.now|crypto\.|useEffect/);
    });
    it.each([...AVATAR_FRAMES,FOUNDERS_FRAME])('clips every ornament of $id inside its footprint',frame=>{
        const html=artwork(frame);
        expect(html).toContain('viewBox="0 0 120 120"');
        expect(html).toMatch(/<clipPath id="([^"]+)-envelope"><rect x="2" y="2" width="116" height="116"><\/rect><\/clipPath>/);
        expect(html).toMatch(/<\/defs><g clip-path="url\(#[^)]+-envelope\)" data-frame-envelope="2 2 116 116">.*<\/g><\/svg>$/);
        expect(html).toContain('aria-hidden="true" focusable="false"');
        expect(html).not.toMatch(/tabindex|<canvas|<image|<animate|<filter/);
    });
    it.each([40,64,128])('preserves the photo, fallback and requested %ipx footprint',size=>{
        const html=renderToStaticMarkup(createElement(AccountAvatar,{name:'Player',url:'/avatar.png',frame:AVATAR_FRAMES[14].id,size}));
        expect(html).toContain(`width:${size}px;height:${size}px`);
        expect(html).toContain('src="/avatar.png"');
        expect(html).toContain('<span aria-hidden="true">P</span>');
        expect(html).toContain('data-avatar-frame="avatar-frame-15"');
        expect(html).not.toContain('is-revealing');
    });
    it('preserves the separate founder seal and does not give it to campaign frames',()=>{
        const html=renderToStaticMarkup(createElement(AccountAvatar,{name:'Founder',frame:FOUNDERS_FRAME_ID}));
        expect(html).toContain('data-founders-seal="true"');
        expect(AVATAR_FRAMES.every(frame=>!artwork(frame).includes('data-founders-seal'))).toBe(true);
    });
    it('only reveals an explicitly selected frame and never starts an idle render loop',()=>{
        const selected=renderToStaticMarkup(createElement(AccountAvatar,{name:'Player',frame:AVATAR_FRAMES[14].id,animateFrame:true}));
        expect(selected).toContain('account-avatar-frame-glint is-revealing');
        const source=readFileSync('src/components/AvatarFrameArtwork.tsx','utf8');
        expect(source).toContain('key={decoration.id}');
        expect(source).not.toMatch(/requestAnimationFrame|setInterval|setTimeout|<animate/);
        const css=readFileSync('src/components/account-avatar.css','utf8');
        expect(css).toMatch(/\.account-avatar-frame-glint\{[^}]*opacity:0[^}]*\}/);
        expect(css).toContain('.account-avatar-frame-glint.is-revealing{animation:account-avatar-edge-glint 650ms ease-out 1 both}');
        expect(css).toContain('100%{opacity:0;stroke-dashoffset:-100}');
        expect(css).toContain('@media (prefers-reduced-motion:reduce){.account-avatar-frame-glint.is-revealing{animation:none;opacity:0}}');
        expect(css).not.toMatch(/infinite|will-change|pulse|animation-delay/);
        expect(css).toMatch(/\.account-avatar-frame\{[^}]*overflow:hidden/);
        expect(css).toMatch(/\.account-avatar-aura\{[^}]*inset:0/);
    });
});
