import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { CrownOpponentArtwork, CrownTabs } from './CrownNavigation';
import { ChampionshipCollection } from './ChampionshipCollection';
import { emptyCampaign } from '../config/campaign';
import { CROWN_CATEGORIES } from './crownCollection';

vi.mock('./Board3D',()=>({Board3D:()=>null}));
it('exposes a single keyboard tab stop and stable panel relationships',()=>{
 const html=renderToStaticMarkup(React.createElement(CrownTabs,{id:'journey',label:'Crown Circuit',value:'challenge',items:[{value:'challenge',label:'Challenge'},{value:'collection',label:'Collection'}],onChange:vi.fn()}));
 expect(html).toContain('role="tablist"');
 expect(html.match(/role="tab"/g)).toHaveLength(2);
 expect(html.match(/tabindex="0"/g)).toHaveLength(1);
 expect(html).toContain('id="journey-tab-challenge" role="tab" aria-selected="true" aria-controls="journey-panel-challenge"');
});
it.each(CROWN_CATEGORIES)('renders the selected %s category with all five panel targets and bounded cards',initialCategory=>{
 const html=renderToStaticMarkup(React.createElement(ChampionshipCollection,{lang:'en',progress:emptyCampaign(),initialCategory}));
 for(const category of CROWN_CATEGORIES) expect(html).toContain(`id="crown-category-panel-${category}"`);
 expect(html).toContain(`id="crown-category-panel-${initialCategory}" aria-labelledby="crown-category-tab-${initialCategory}" tabindex="0"`);
 expect(html.match(/class="crown-collection-card"/g)?.length).toBeLessThanOrEqual(4);
 expect(html).not.toContain('data-equip-reward');
});
it('reuses adopted 2D pieces without introducing enemy models or posters',()=>{
 const queen=renderToStaticMarkup(React.createElement(CrownOpponentArtwork,{stageId:99}));
 const king=renderToStaticMarkup(React.createElement(CrownOpponentArtwork,{stageId:100}));
 expect(queen).toContain('data-current-piece="Queen"');
 expect(queen).toContain('♛');
 expect(king).toContain('data-current-piece="King"');
 expect(king).toContain('♚');
 expect(queen+king).not.toContain('enemy-');
 expect(queen+king).not.toContain('.webp');
});
