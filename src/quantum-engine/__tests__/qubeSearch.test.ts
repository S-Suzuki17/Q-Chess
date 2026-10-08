import { describe, expect, it, vi } from 'vitest';
import { searchBestMove, searchPositionKey } from '../ai/search';
import { EvalQoppelia } from '../ai/evalQoppelia';
import { getAllConcreteMoves } from '../ai/random';
import { applyMove } from '../stateTransition';
import { createInitialState } from '../initialState';
import { PIECE_KING as K, PIECE_ROOK as R, PIECE_QUEEN as Q, PIECE_PAWN as P } from '../constants';
import type { GameState, QuantumPiece } from '../types';
import { requestQubeSearch } from '../../lib/cpuClient';
import { qubeSearchProfile } from '../../../server/src/quantum-engine/ai/searchProfiles';
import { searchCpuPracticePosition } from '../../../server/src/services/CpuPracticeSearchWorker';

const piece=(id:string,owner:'white'|'black',state:number,row:number,col:number):QuantumPiece=>({
    id,owner,state,position:{row,col},origin:{row,col},alive:true,hasMoved:true,promoted:false,
});
const position=(pieces:QuantumPiece[]):GameState=>({pieces,sideToMove:'white',ply:10,winner:null,hash:'untrusted',captured:{white:0,black:0}});

describe('precision QUBE search', () => {
    it('finishes a useful root iteration before deep quantum continuations exhaust the budget', () => {
        const state = createInitialState();
        const legal = getAllConcreteMoves(state, { allPromotions: true, playable: true });
        let ticks = 0;
        const clock = vi.spyOn(performance, 'now').mockImplementation(() => ticks++);
        try {
            const result = searchBestMove(state, new EvalQoppelia(), {
                timeLimitMs: legal.length * 2 + 10, maxDepth: 16, quiescenceDepth: 4, playableRoot: true });
            expect(result.depth).toBe(1);
            expect(result.quiescenceDepth).toBe(0);
            expect(legal).toContainEqual(result.move);
        } finally { clock.mockRestore(); }
    });
    it('uses an independent high-precision neutral worker budget', async () => {
        let sent:unknown;
        const terminate=vi.fn();
        vi.stubGlobal('Worker',class {
            onmessage?:(event:unknown)=>void;
            terminate=terminate;
            postMessage(message:unknown){sent=message;this.onmessage?.({data:{result:{move:null}}});}
        });
        try {
            const state=createInitialState();
            await requestQubeSearch(state,new AbortController().signal);
            expect(sent).toEqual({state,personality:'balanced',...qubeSearchProfile()});
            expect(terminate).toHaveBeenCalledOnce();
        } finally {vi.unstubAllGlobals();}
    });
    it('never inherits an attacking opponent evaluator for a paid hint', () => {
        const observed=vi.spyOn(EvalQoppelia.prototype,'evaluate');
        const state=position([piece('wk','white',K,7,7),piece('wr','white',R,3,0),piece('bk','black',K,3,7)]);
        try {
            const neutral=searchCpuPracticePosition(state,{timeLimitMs:1000,maxDepth:2},true,'balanced');
            const attacking=searchCpuPracticePosition(state,{timeLimitMs:1000,maxDepth:2},true,'attacker');
            expect(attacking).toEqual(neutral);
            expect(applyMove(state,attacking!).winner).toBe('white');
            expect(observed).toHaveBeenCalled();
        } finally {observed.mockRestore();}
    });
    it('keys every quantum/rule-relevant field and does not use untrusted hashes', () => {
        const state=createInitialState(),key=searchPositionKey(state);
        expect(searchPositionKey({...state,hash:'different'})).toBe(key);
        for(const patch of [{state:K|P},{hasMoved:true},{alive:false},{promoted:true,promotedType:Q},
            {origin:{row:5,col:0}},{position:{row:5,col:0}}]) {
            expect(searchPositionKey({...state,pieces:[{...state.pieces[0],...patch},...state.pieces.slice(1)]})).not.toBe(key);
        }
        expect(searchPositionKey({...state,captured:{white:1,black:0}})).not.toBe(key);
        expect(searchPositionKey({...state,sideToMove:'black'})).not.toBe(key);
        expect(searchPositionKey({...state,lastMove:{pieceId:'w_1',from:{row:6,col:0},target:{row:4,col:0},chosenType:P}})).not.toBe(key);
    });
    it('reuses calculations without changing exact fixed-depth results or legal moves', () => {
        const state=position([piece('wk','white',K,7,7),piece('wr','white',R,6,5),
            piece('bk','black',K,0,0),piece('br','black',R,1,2)]);
        // No hardware-dependent deadline: this is a bounded depth/quiet test of
        // identical exhaustive algorithms, not an assertion about playing Elo.
        const clock=vi.spyOn(performance,'now').mockReturnValue(0);
        try {
            const evaluator=new EvalQoppelia(),before=JSON.stringify(state);
            const plain=searchBestMove(state,evaluator,{maxDepth:3,quiescenceDepth:0,transpositionEntries:0,timeLimitMs:1000});
            const cached=searchBestMove(state,evaluator,{maxDepth:3,quiescenceDepth:0,transpositionEntries:5000,timeLimitMs:1000});
            expect(cached.depth).toBe(3);expect(plain.depth).toBe(3);
            expect(cached.score).toBeCloseTo(plain.score,8);
            expect(getAllConcreteMoves(state)).toContainEqual(cached.move);
            expect(cached.cacheHits).toBeGreaterThan(0);
            expect(cached.nodes).toBeLessThanOrEqual(plain.nodes);
            expect(JSON.stringify(state)).toBe(before);
        } finally {clock.mockRestore();}
    });
    it('honours cancellation before allocating any high-precision worker', async () => {
        const worker=vi.fn();vi.stubGlobal('Worker',worker);
        const controller=new AbortController();controller.abort();
        try {
            await expect(requestQubeSearch(createInitialState(),controller.signal)).rejects.toMatchObject({name:'AbortError'});
            expect(worker).not.toHaveBeenCalled();
        } finally {vi.unstubAllGlobals();}
    });
});
