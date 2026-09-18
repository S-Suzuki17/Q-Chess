import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {CampaignResult} from './CampaignResult';
const outcome={won:true,draw:false,playerMoves:40,hintsUsed:0,initialSeconds:10,remainingSeconds:1};
const noop=()=>{};
it('keeps one result title separate from the non-interactive cinematic and names the star reward',()=>{
 const html=renderToStaticMarkup(React.createElement(CampaignResult,{lang:'ja',stageId:99,firstClear:true,effect:'champion-effect-098',outcome,onBack:noop,onRetry:noop,saveError:false,newMusic:['valkyrie']}));
 expect(html.match(/<h2/g)).toHaveLength(1);expect(html).toContain('★★★');
 expect(html).toContain('data-star-music-earned="valkyrie"');expect(html).toContain('The Eighth Rank');
 expect(html).toContain('data-contained="true"');expect(html).not.toContain('装備');
});
it.each([{won:false,draw:false},{won:false,draw:true}])('never celebrates a non-winning result %j',result=>{
 const html=renderToStaticMarkup(React.createElement(CampaignResult,{lang:'ja',stageId:99,firstClear:false,effect:'champion-effect-098',outcome:{...outcome,...result},onBack:noop,onRetry:noop,saveError:false,newMusic:['valkyrie']}));
 expect(html).not.toContain('data-victory-effect');expect(html).not.toContain('data-star-music-earned');expect(html.match(/<h2/g)).toHaveLength(1);
});
