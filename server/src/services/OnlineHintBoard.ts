/** Public online board data shared with the worker launcher. No game authority,
 * server implementation or ledger dependency belongs in this transfer shape. */
export interface OnlineHintPiece {
    id: number;
    team: number;
    possibilities: string[];
    x: number;
    y: number;
    captured: boolean;
    hasMoved?: boolean;
    promoted?: boolean;
}
export interface OnlineHintBoard {
    board: (number | null)[];
    pieces: OnlineHintPiece[];
    turn: number;
}
