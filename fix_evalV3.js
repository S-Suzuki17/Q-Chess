const fs = require('fs');

let code = fs.readFileSync('src/quantum-engine/ai/evalV3.ts', 'utf8');

const target = `            if (p.state === PIECE_KING) {
                if (p.owner === player) {
                    score -= KING_CONFIRMED_VALUE;
                } else {
                    score += KING_CONFIRMED_VALUE;
                }
            }`;

const replacement = `            if (p.state === PIECE_KING) {
                if (p.owner === player) {
                    // 自玉が確定するのは一番ダメ (ペナルティ)
                    score -= KING_CONFIRMED_VALUE;
                }
                // 相手の玉を確定させるボーナスはユーザーの要望により削除
            }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/quantum-engine/ai/evalV3.ts', code, 'utf8');
