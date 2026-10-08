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
        expect(html).toContain('data-effect-renderer="quantum-coronation-v5"');
        expect(html).toContain(`data-effect-stage="${effect.requiredWins}"`);
        expect(html).toContain('aria-label="CHECKMATE"');
        expect(html).not.toContain('reward-sigil');
        expect((html.match(/<canvas/g)??[]).length).toBe(2);
        expect(html).not.toContain('<h2');
        expect(html).not.toContain('<button');
    }
});
it('only labels confirmed checkmates, never timeout or resignation victories',()=>{
    const html=renderToStaticMarkup(React.createElement(VictoryCelebration,{effect:'champion-effect-003',checkmate:false}));
    expect(html).toContain('data-effect-renderer="quantum-coronation-v5"');
    expect(html).not.toContain('CHECKMATE');
});
it('does not add a special effect for the standard reward',()=>{
    expect(renderToStaticMarkup(React.createElement(VictoryCelebration,{effect:'standard'}))).toBe('');
});

it('renders a neutral standard Crown victory only with verified encounter context',()=>{
 const html=renderToStaticMarkup(React.createElement(VictoryCelebration,{effect:'standard',encounter:{stageId:41,foe:'bishop',finalBoss:false}}));
 expect(html).toContain('data-encounter-stage="41"');
 expect(html).toContain('data-encounter-foe="bishop"');
 expect(html).toContain('data-final-boss="false"');
 expect(html).not.toContain('CHECKMATE');
 expect(html).not.toContain('<button');
});
