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
        expect(html).toContain('victory-fx-stage');
        expect(html).toContain({rings:'victory-fx-orbit',shards:'victory-fx-crystal',starfall:'victory-fx-constellation',corona:'victory-fx-crown'}[effect.motif]);
        expect(html.includes('victory-fx-rays')).toBe(effect.tier>=8);
        expect(html.includes('victory-fx-dais')).toBe(effect.tier>=5);
        expect((html.match(/<i /g)??[]).length).toBeLessThanOrEqual(52);
        expect(html).not.toContain('<button');
    }
});
it('does not add a special effect for the standard reward',()=>{
    expect(renderToStaticMarkup(React.createElement(VictoryCelebration,{effect:'standard'}))).toBe('');
});
