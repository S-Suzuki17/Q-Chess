import {describe,it,expect} from 'vitest';
import {emptyCampaign,equipReward} from '../config/campaign';
import {captureMatchAppearance,initialMatchAppearance} from './matchAppearance';

describe('match appearance snapshot',()=>{
    it('cannot be changed by progress updates in this or another tab',()=>{
        const progress=emptyCampaign();
        const frozen=captureMatchAppearance(progress);
        progress.board='walnut';
        progress.piece='boxwood';
        expect(frozen.board).toBe('standard');
        expect(frozen.piece).toBe('standard');
        expect(Object.isFrozen(frozen)).toBe(true);
        expect(captureMatchAppearance(progress).board).toBe('walnut');
    });
    it('prefers the in-memory selection when storage failed',()=>{
        const progress=equipReward(emptyCampaign(),'board','walnut');
        expect(initialMatchAppearance({loaded:true,progress},()=>{throw Error('blocked');}).board).toBe('walnut');
    });
    it('loads saved unlocked selections before the first match, with safe fallback',()=>{
        const snapshot={loaded:false,progress:emptyCampaign()};
        expect(initialMatchAppearance(snapshot,()=>({getItem:()=>JSON.stringify({...emptyCampaign(),board:'walnut'})})).board).toBe('walnut');
        expect(initialMatchAppearance(snapshot,()=>({getItem:()=>JSON.stringify({...emptyCampaign(),piece:'iceglass'})})).piece).toBe('standard');
        expect(initialMatchAppearance(snapshot,()=>{throw Error('blocked');}).board).toBe('standard');
    });
});
