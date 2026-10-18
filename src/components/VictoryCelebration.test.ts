import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {CHAMPIONSHIP_REWARDS} from '../config/championshipRewards';
import {VictoryCelebration} from './VictoryCelebration';
import {CampaignResult} from './CampaignResult';

it('gives every earned effect a bounded, non-interactive cinematic composition',()=>{
    const effects=CHAMPIONSHIP_REWARDS.filter(reward=>reward.kind==='effect');
    expect(effects).toHaveLength(20);
    for(const effect of effects) {
        const html=renderToStaticMarkup(React.createElement(VictoryCelebration,{effect:effect.id,preview:true}));
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain(`data-effect-motif="${effect.motif}"`);
        expect(html).toContain('data-effect-renderer="quantum-coronation-v6"');
        expect(html).toContain(`data-effect-stage="${effect.requiredWins}"`);
        expect(html).toContain('data-victory-headline="CHECK MATE">CHECK MATE</span>');
        expect(html).not.toContain('reward-sigil');
        expect((html.match(/<canvas/g)??[]).length).toBe(2);
        expect(html).not.toContain('<h2');
        expect(html).not.toContain('<button');
    }
});
it('keeps decorative branding for a victory without changing the confirmed result reason',()=>{
    const html=renderToStaticMarkup(React.createElement(VictoryCelebration,{effect:'champion-effect-003',checkmate:false}));
    expect(html).toContain('data-effect-renderer="quantum-coronation-v6"');
    expect(html).toContain('data-victory-headline="CHECK MATE">CHECK MATE</span>');
    expect(html).toContain('data-checkmate-confirmed="false"');
    expect(html).toContain('aria-hidden="true"');
});
it('provides a built-in standard ceremony without resolving or granting an earned reward',()=>{
    const html=renderToStaticMarkup(React.createElement(VictoryCelebration,{effect:'standard'}));
    expect(html).toContain('data-victory-effect="champion-effect-standard"');
    expect(html).toContain('data-effect-stage="0"');
    expect(html).toContain('data-victory-headline="CHECK MATE">CHECK MATE</span>');
});

it('keeps verified encounter context without changing the match reason',()=>{
 const html=renderToStaticMarkup(React.createElement(VictoryCelebration,{effect:'standard',encounter:{stageId:41,foe:'bishop',finalBoss:false}}));
 expect(html).toContain('data-encounter-stage="41"');
 expect(html).toContain('data-encounter-foe="bishop"');
 expect(html).toContain('data-final-boss="false"');
 expect(html).toContain('data-checkmate-confirmed="false"');
 expect(html).toContain('data-victory-headline="CHECK MATE">CHECK MATE</span>');
 expect(html).not.toContain('<button');
});
it.each(['loss','draw'] as const)('never mounts the decorative victory headline for a Crown %s',result=>{
 const html=renderToStaticMarkup(React.createElement(CampaignResult,{
  lang:'en',stageId:1,firstClear:false,effect:'standard',
  outcome:{won:false,draw:result==='draw',playerMoves:10,hintsUsed:0,initialSeconds:600,remainingSeconds:10},
  onBack:()=>{},onRetry:()=>{},saveError:false,
 }));
 expect(html).not.toContain('data-victory-headline');
 expect(html).not.toContain('data-victory-layer');
 expect(html).toContain(`data-result="${result}"`);
});
