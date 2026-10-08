import { describe, expect, it } from 'vitest';
import { CPU_PERSONALITIES, PERSONALITY_WEIGHTS, randomCPUPersonality, cpuPersonalityForGame } from './cpuPersonalities';
import { cpuPersonalityText } from '../locales/cpuPersonalityText';
import { EvalQoppelia } from '../quantum-engine/ai/evalQoppelia';
import { searchBestMove } from '../quantum-engine/ai/search';
import { applyMove } from '../quantum-engine/stateTransition';
import { createInitialState } from '../quantum-engine/initialState';
import { qubeSearchProfile, circuitSearchProfile } from '../../server/src/quantum-engine/ai/searchProfiles';
import { cpuDifficulty } from './cpuDifficulty';
import { officialCpuPractice } from '../lib/cpuPractice';

describe('independent CPU styles and QUBE analysis', () => {
    it('offers all six random styles, with safe input bounds', () => {
        expect(CPU_PERSONALITIES.map((_,i) => randomCPUPersonality(() => (i+.5)/6))).toEqual(CPU_PERSONALITIES);
        expect(randomCPUPersonality(() => -1)).toBe('balanced');
        expect(randomCPUPersonality(() => NaN)).toBe('balanced');
        expect(randomCPUPersonality(() => 1)).toBe('flexible');
    });
    it('restores a style from a session identity, not its level or revision', () => {
        const ids = Array.from({length:100},(_,i) => `server-session-${i}`);
        expect(new Set(ids.map(cpuPersonalityForGame)).size).toBe(6);
        ids.forEach(id => expect(cpuPersonalityForGame(id)).toBe(cpuPersonalityForGame(id)));
        expect(officialCpuPractice({})).toBe(true);
        expect(officialCpuPractice({cpuPersonality:'attacker'})).toBe(false);
    });
    it.each(['ja','en','zh','ru','fr','de','es','tr','pl','hi','pt','ta'] as const)('names each style in %s', lang => {
        const names = CPU_PERSONALITIES.map(style => cpuPersonalityText(lang,style));
        expect(names.every(name => typeof name === 'string' && name.length > 0)).toBe(true);
        expect(new Set(names).size).toBe(6);
    });
    it('keeps every strength budget identical across styles and lowers the final Crown ceiling', () => {
        const groups = Array.from({length:34},(_,i) => circuitSearchProfile(i+1));
        groups.slice(1).forEach((profile,i) => {
            expect(profile.timeLimitMs).toBeGreaterThan(groups[i].timeLimitMs);
            expect(profile.maxDepth).toBeGreaterThanOrEqual(groups[i].maxDepth);
        });
        expect(groups[0]).toMatchObject({timeLimitMs:500,maxDepth:0});
        expect(groups[33]).toMatchObject({timeLimitMs:3000,maxDepth:4});
        const hint=qubeSearchProfile();
        expect(hint.timeLimitMs).toBeGreaterThan(cpuDifficulty(5).timeLimitMs);
        expect(hint.maxDepth).toBeGreaterThan(cpuDifficulty(5).maxDepth);
        expect(hint.quiescenceDepth).toBe(4);
        expect(hint.transpositionEntries).toBeGreaterThan(0);
    });
    it.each(CPU_PERSONALITIES)('uses real candidate-collapse legality in canonical %s search', style => {
        const state = createInitialState(), original = JSON.stringify(state);
        const result = searchBestMove(state,new EvalQoppelia(PERSONALITY_WEIGHTS[style]),{timeLimitMs:300,maxDepth:0});
        expect(result.move).not.toBeNull();
        expect(applyMove(state,result.move!).sideToMove).toBe('black');
        expect(JSON.stringify(state)).toBe(original);
    });
});
