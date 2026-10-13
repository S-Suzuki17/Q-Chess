import {describe,it,expect} from 'vitest';
import {emptyCampaign,type CampaignOutcome} from '../../config/campaign';
import {finishStage} from '../../config/circuitStages';
import {castleQuestNextStage} from '../castleQuestJourney';

const win:CampaignOutcome={won:true,draw:false,hintsUsed:0,remainingSeconds:500,initialSeconds:600,playerMoves:10};
describe('saved victory prepares a tile, never a match',()=>{
    it('requires a saved win, rejects a save failure even when memory advanced',()=>{
        const before=emptyCampaign(),after=finishStage(before,1,win);
        expect(castleQuestNextStage(before,1,win,false)).toBeNull();
        expect(castleQuestNextStage(after,1,win,true)).toBeNull();
        expect(castleQuestNextStage(after,1,win,false)).toBe(2);
    });
    it.each([{...win,won:false},{...win,won:false,draw:true},{...win,won:true,draw:true},null])('loss/draw/no result cannot advance: %j',outcome=>{
        expect(castleQuestNextStage(finishStage(emptyCampaign(),1,win),1,outcome,false)).toBeNull();
    });
    it('replaying a cleared tile does not clear or grant its next tile',()=>{
        const once=finishStage(emptyCampaign(),1,win),repeated=finishStage(once,1,win);
        expect(repeated.stageStars).toEqual(once.stageStars);
        expect(castleQuestNextStage(repeated,1,win,false)).toBe(2);
        expect(repeated.stageStars).toHaveLength(1);
    });
    it('99 prepares tile100, 100 never creates 101',()=>{
        const progress={...emptyCampaign(),stageStars:Array.from({length:100},()=>3)};
        expect(castleQuestNextStage(progress,99,win,false)).toBe(100);
        expect(castleQuestNextStage(progress,100,win,false)).toBeNull();
    });
    it.each([0,-1,101,1.1,NaN])('invalid stage %s cannot advance',id=>{
        expect(castleQuestNextStage(finishStage(emptyCampaign(),1,win),id,win,false)).toBeNull();
    });
});
