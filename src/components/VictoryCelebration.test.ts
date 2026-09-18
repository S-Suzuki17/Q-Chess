import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {CHAMPIONSHIP_REWARDS} from '../config/championshipRewards';
import {VictoryCelebration} from './VictoryCelebration';

it('gives every earned effect a bounded, non-interactive cinematic composition',()=>{
    const effects=CHAMPIONSHIP_REWARDS.filter(reward=>reward.kind==='effect');
    expect(effects).toHaveLength(20);
    for(const effect of effects) {
        const html=renderToStaticMarkup(React.createElement(VictoryCelebration,{effect:effect.id,preview:true}));
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain(`data-effect-motif="${effect.motif}"`);
        expect(html).toContain('victory-fx-fallback');
        expect((html.match(/<canvas/g)??[]).length).toBe(1);
        expect(html).not.toContain('<h2');
        expect(html).not.toContain('<button');
    }
});
it('does not add a special effect for the standard reward',()=>{
    expect(renderToStaticMarkup(React.createElement(VictoryCelebration,{effect:'standard'}))).toBe('');
});
