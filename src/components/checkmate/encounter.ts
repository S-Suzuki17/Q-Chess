import type { PieceFinish } from '../../config/campaign';
/** Supplied by an actual campaign outcome, never inferred from an equipped cosmetic. */
export type VictoryEncounter = {
    stageId: number;
    foe: 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
    finalBoss: boolean;
    /** Actual equipped finish, supplied by the campaign. Unknown means no piece is invented. */
    pieceFinish?: PieceFinish;
    foeWhite?: boolean;
};
export function victoryEncounterModel(encounter: VictoryEncounter) {
    // A King boss is valid only at the final campaign stage.
    const foe = encounter.foe === 'king' && (!encounter.finalBoss || encounter.stageId !== 100) ? 'queen' : encounter.foe;
    return `/models/${foe}.glb`;
}
