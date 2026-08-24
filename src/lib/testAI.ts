import { IdentityPool } from './IdentityPool';
import { calculateDeepMove } from './ServerAIEngine';

const pool = new IdentityPool();
const tokens: any[] = [];
let idCounter = 1;
['white', 'black'].forEach(player => {
    [0, 1, 6, 7].forEach(row => {
        if ((player === 'white' && row > 1) || (player === 'black' && row < 6)) return;
        for (let col = 0; col < 8; col++) {
            const id = `token_${idCounter++}`;
            pool.registerPiece(id);
            tokens.push({ id, player, row, col, isCaptured: false, probabilities: {} });
        }
    });
});

console.time('AI');
const result = calculateDeepMove(5, tokens, pool, 'black');
console.timeEnd('AI');
console.log(result);