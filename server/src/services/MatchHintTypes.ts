import type { GameState, Move } from '../quantum-engine/types';
import type { HintAdvice } from '../quantum-engine/ai/hintAdvice';
import type { HintContextKind, HintContextMode, HintTicketPurchase, HintTicketRequest, HintTicketContext, MatchHintReceipt } from './HintTicketStore';
import type { Piece } from '../game/GameEngine';

export class MatchHintError extends Error {
    constructor(public readonly code: string) { super(code); this.name = 'MatchHintError'; }
}
export interface HintRequestContext {
    signal: AbortSignal;
    check(): Promise<void>;
    /** Binds analysis cancellation to the authenticated current connection. */
    connectionId?: string;
}
export interface OnlineHintBoard {
    board: (number | null)[];
    pieces: Piece[];
    turn: number;
}
export interface TrustedHintPosition {
    contextId: string;
    kind: HintContextKind;
    mode: HintContextMode;
    side: 'white' | 'black';
    revision: number;
    stateHash: string;
    rulesVersion: string;
    state: GameState;
    remainingMs: number;
    validUntilMs: number;
    online?: OnlineHintBoard;
    validateMove(move: Move): HintAdvice;
    /** Synchronous final authority check and a separate mutation fence. */
    acquire(): () => void;
}
export interface HintPositionRegistry {
    contextId(userId: string, referenceId: string): string;
    position(userId: string, referenceId: string, revision: number): TrustedHintPosition;
}
export interface HintLedger {
    readClock(): Promise<number>;
    readReceipt(input: HintTicketRequest & { notBefore?: string }): Promise<MatchHintReceipt | null>;
    readExisting(input: HintTicketContext): Promise<MatchHintReceipt | null>;
    buy(input: HintTicketPurchase): Promise<MatchHintReceipt>;
}
export const isHintUuid = (value: unknown): value is string => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const isHintRevision = (value: unknown): value is number => Number.isSafeInteger(value)
    && (value as number) >= 0 && (value as number) <= 2147483647;
