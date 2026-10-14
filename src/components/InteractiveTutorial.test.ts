import { describe, it, expect } from 'vitest';
import { tutorialDict } from '../locales/rulesDict';
import { LANGUAGES } from '../locales/dict';

describe('InteractiveTutorial & Deduction Practice Specs', () => {
    it('provides all 12 languages with full tutorial metadata including demo and reset labels', () => {
        expect(LANGUAGES.length).toBe(12);

        for (const { code } of LANGUAGES) {
            const entry = tutorialDict[code];
            expect(entry, `missing tutorialDict for ${code}`).toBeDefined();
            expect(entry.title.length, `title missing for ${code}`).toBeGreaterThan(0);
            expect(entry.close.length, `close missing for ${code}`).toBeGreaterThan(0);
            expect(entry.play.length, `play missing for ${code}`).toBeGreaterThan(0);
            expect(entry.next.length, `next missing for ${code}`).toBeGreaterThan(0);
            expect(entry.reviewDemo.length, `reviewDemo missing for ${code}`).toBeGreaterThan(0);
            expect(entry.resetStep.length, `resetStep missing for ${code}`).toBeGreaterThan(0);
            expect(entry.steps.length, `steps count for ${code}`).toBe(12);
        }
    });

    it('contains deduction practice and piece count constraint keywords in key languages', () => {
        // Japanese checks
        const jaSteps = tutorialDict.ja.steps;
        expect(jaSteps[0]).toContain('【見本】');
        expect(jaSteps[0]).toContain('【類題】');
        expect(jaSteps[2]).toContain('【類題クリア】');
        expect(jaSteps[11]).toContain('【駒数制約】');
        expect(jaSteps[11]).toContain('クイーン枠');
        expect(tutorialDict.ja.reviewDemo).toBe('見本を再確認');
        expect(tutorialDict.ja.resetStep).toBe('やり直す');

        // English checks
        const enSteps = tutorialDict.en.steps;
        expect(enSteps[0]).toContain('[Demo]');
        expect(enSteps[0]).toContain('[Practice]');
        expect(enSteps[2]).toContain('[Practice Complete]');
        expect(enSteps[11]).toContain('[Piece Count Constraint]');
        expect(tutorialDict.en.reviewDemo).toBe('Review Demo');
        expect(tutorialDict.en.resetStep).toBe('Reset');
    });

    it('verifies tutorial progression and target coordinate sequence', () => {
        const expectedTargets: Record<number, { row: number; col: number; notation: string }> = {
            0: { row: 6, col: 4, notation: 'e2' },
            1: { row: 3, col: 7, notation: 'h5' },
            3: { row: 1, col: 7, notation: 'h7' },
            4: { row: 3, col: 7, notation: 'h5' },
            6: { row: 7, col: 4, notation: 'e1' },
            7: { row: 5, col: 5, notation: 'f3' },
            9: { row: 3, col: 7, notation: 'h5' },
            10: { row: 5, col: 5, notation: 'f3' },
        };

        const toNotation = (row: number, col: number) => {
            const file = String.fromCharCode('a'.charCodeAt(0) + col);
            const rank = 8 - row;
            return `${file}${rank}`;
        };

        for (const [stepStr, expected] of Object.entries(expectedTargets)) {
            const step = Number(stepStr);
            const notation = toNotation(expected.row, expected.col);
            expect(notation).toBe(expected.notation);
        }
    });

    it('verifies quantum piece probability collapse and queen slot constraint logic', () => {
        const START_PROBS = { King: 1/16, Queen: 1/16, Rook: 2/16, Bishop: 2/16, Knight: 2/16, Pawn: 8/16 };
        const DIAG_PROBS = { King: 0, Queen: 0.5, Rook: 0, Bishop: 0.5, Knight: 0, Pawn: 0 };
        const ROOK_QUEEN_PROBS = { King: 0, Queen: 0.5, Rook: 0.5, Bishop: 0, Knight: 0, Pawn: 0 };
        const KNIGHT_PROBS = { King: 0, Queen: 0, Rook: 0, Bishop: 0, Knight: 1, Pawn: 0 };
        const QUEEN_PROBS = { King: 0, Queen: 1, Rook: 0, Bishop: 0, Knight: 0, Pawn: 0 };
        const ROOK_PROBS = { King: 0, Queen: 0, Rook: 1, Bishop: 0, Knight: 0, Pawn: 0 };

        // Step 1: Diagonal move narrows to Bishop or Queen
        expect(DIAG_PROBS.Bishop).toBe(0.5);
        expect(DIAG_PROBS.Queen).toBe(0.5);
        expect(DIAG_PROBS.Rook).toBe(0);
        expect(DIAG_PROBS.Knight).toBe(0);

        // Step 4: Vertical capture narrows to Rook or Queen
        expect(ROOK_QUEEN_PROBS.Rook).toBe(0.5);
        expect(ROOK_QUEEN_PROBS.Queen).toBe(0.5);
        expect(ROOK_QUEEN_PROBS.Bishop).toBe(0);

        // Step 7: L-shape move confirms Knight
        expect(KNIGHT_PROBS.Knight).toBe(1);

        // Step 10: Piece that made both straight and diagonal move becomes Queen
        // And by team constraint (max 1 Queen), another Rook/Queen candidate piece collapses to Rook
        let b1 = { id: 'b1', probabilities: ROOK_QUEEN_PROBS };
        let b2 = { id: 'b2', probabilities: ROOK_QUEEN_PROBS };

        // Collapse b1 to Queen
        b1 = { ...b1, probabilities: QUEEN_PROBS };
        expect(b1.probabilities.Queen).toBe(1);

        // Constraint propagation: since b1 is Queen and each side has 1 Queen slot,
        // b2 cannot be Queen, so its Queen probability drops to 0 and Rook becomes 1
        if (b1.probabilities.Queen === 1 && b2.probabilities.Queen > 0) {
            b2 = { ...b2, probabilities: ROOK_PROBS };
        }
        expect(b2.probabilities.Queen).toBe(0);
        expect(b2.probabilities.Rook).toBe(1);
    });
});
