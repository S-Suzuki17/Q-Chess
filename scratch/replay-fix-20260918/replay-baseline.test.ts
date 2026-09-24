import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { GameRecord } from '../../src/lib/gameRecordService';
import ReplayBoard from '../../src/components/ReplayBoard';
import { createLocalPosition, applyLocalMove } from '../../src/lib/localGame';

vi.mock('react', async (original) => {
    const actual = await original<typeof import('react')>();
    return { ...actual, useState: () => [1, vi.fn()] };
});
vi.mock('../../src/components/QuantumPieceUI', () => ({
    QuantumPieceUI: ({ id }: { id: string }) => React.createElement('i', { 'data-token': id })
}));

const modernRecord: GameRecord = {
    white_player: 'Local player', black_player: 'CPU', winner: 'white_wins', mode: 'cpu', total_moves: 1,
    moves: [{ turn: 1, player: 'white', tokenId: 'w_17', from: [6, 0], to: [5, 0], possibleTypes: ['Pawn', 'Rook', 'Queen'] }]
};

const cells = (record: GameRecord) => renderToStaticMarkup(React.createElement(ReplayBoard, {
    lang: 'en', record, onHome: () => {}
})).split('class="flex-1 relative').slice(1).map(cell => cell.match(/data-token="([^"]+)"/)?.[1] ?? null);

it('reproduces the live-local/replay ID mismatch without calling external services', () => {
    const before = createLocalPosition();
    const live = applyLocalMove(before.tokens, before.pool, {
        tokenId: 'w_17', targetRow: 5, targetCol: 0, possibleTypes: ['Pawn', 'Rook', 'Queen']
    }, 'white', []);
    expect(live.tokens.find(token => token.id === 'w_17')).toMatchObject({ row: 5, col: 0 });
    const replay = cells(modernRecord);
    expect(replay).toHaveLength(64);
    // These assertions document the defect; the corrected implementation must invert them.
    expect(replay[5 * 8]).toBeNull();
    expect(replay[6 * 8]).toBe('token_17');
});

it('shows that old token_N history moves while identical modern w_N history does not', () => {
    const legacyRecord = { ...modernRecord, moves: [{ ...modernRecord.moves[0], tokenId: 'token_17' }] };
    expect(cells(legacyRecord)[5 * 8]).toBe('token_17');
    expect(cells(legacyRecord)[6 * 8]).toBeNull();
});
