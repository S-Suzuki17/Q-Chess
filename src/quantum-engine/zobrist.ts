import { GameState, Position } from './types';
import { PlayerColor } from './constants';

function randomBigInt64(): bigint {
    const low = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    const high = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    return (high << BigInt(32)) | low;
}

// [Square 64][Color 2][Mask 64]
export const ZOBRIST_TABLE = Array.from({ length: 64 }, () =>
    Array.from({ length: 2 }, () =>
        Array.from({ length: 64 }, () => randomBigInt64())
    )
);

export const ZOBRIST_TURN = randomBigInt64();

export function computeZobristHash(state: GameState): bigint {
    let hash = BigInt(0);

    for (const p of state.pieces) {
        if (!p.alive) continue;

        const sq = p.position.row * 8 + p.position.col;
        const colorIdx = p.owner === 'white' ? 0 : 1;
        
        // Ensure state mask is strictly 6 bits (0-63)
        let mask = p.state & 63;
        
        // Use higher bits for hasMoved (64) and promotedType (128-512)
        if (p.hasMoved) mask |= 64;
        if (p.promotedType) mask |= (p.promotedType << 7); // shifts by 7 bits, giving unique range

        // We can just XOR this against the table. We need the table to be larger if mask > 63,
        // Wait, instead of expanding the table, we can just XOR the properties directly into the hash
        // shifted by some arbitrary primes/amounts, or just expand the Zobrist array.
        // Easiest is to XOR the square/color/mask, and then XOR extra state directly.
        hash ^= ZOBRIST_TABLE[sq][colorIdx][p.state & 63];
        if (p.hasMoved) hash ^= (BigInt(1) << BigInt(sq)); // Unique per square
        if (p.promotedType) hash ^= (BigInt(p.promotedType) << BigInt(sq + 8));
    }

    if (state.sideToMove === 'black') {
        hash ^= ZOBRIST_TURN;
    }

    hash ^= BigInt(state.captured.white) * BigInt('1234567891');
    hash ^= BigInt(state.captured.black) * BigInt('9876543211');

    return hash;
}
