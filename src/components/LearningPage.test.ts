import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LearningArticle, LearningPage } from './LearningPage';
import { LearningEntry, SiteIntroduction } from './SiteInformation';
import { learningChain, learningCopy, learningMoves } from '../locales/siteContent';
import { deduceMoveTypesGeometry } from '../quantum-engine/move';
import { createInitialState } from '../quantum-engine';
import { resolveQuantumState } from '../quantum-engine/quantum/candidateSolver';
import { PIECE_BISHOP, PIECE_KING, PIECE_KNIGHT, PIECE_PAWN, PIECE_QUEEN, PIECE_ROOK } from '../quantum-engine/constants';
import { metadata as guideMetadata } from '../app/guide/page';
import { metadata as faqMetadata } from '../app/faq/page';
import type { PieceType } from '../config/gameConfig';

const bits: Record<PieceType, number> = { King: PIECE_KING, Queen: PIECE_QUEEN, Rook: PIECE_ROOK, Bishop: PIECE_BISHOP, Knight: PIECE_KNIGHT, Pawn: PIECE_PAWN };
const position = (square: string) => ({ row: 8 - Number(square[1]), col: square.charCodeAt(0) - 97 });
const mask = (types: readonly PieceType[]) => types.reduce((state, type) => state | bits[type], 0);

describe('public learning guides', () => {
    it.each(learningMoves)('matches the authoritative engine for $from → $to', example => {
        const allowed = deduceMoveTypesGeometry(position(example.from), position(example.to), 'white', false, true);
        const actual = example.candidates.filter(type => (bits[type] & allowed) !== 0);
        expect(actual).toEqual(example.remaining);
    });
    it('validates the complete candidate chain, including the captured Rook slot', () => {
        let whiteIndex = 0;
        const pieces = createInitialState().pieces.map(piece => {
            if (piece.owner !== 'white') return piece;
            const index = whiteIndex++;
            return { ...piece,
                state: index < 5 ? mask(learningChain.pieces[index].before) : bits[learningChain.known[index - 5]],
                alive: index !== 6,
            };
        });
        const before = resolveQuantumState(pieces).filter(piece => piece.owner === 'white');
        expect(before).toHaveLength(16);
        expect(before[6].alive).toBe(false);
        expect(before.slice(0, 5).map(piece => piece.state)).toEqual(learningChain.pieces.map(piece => mask(piece.before)));
        const allowed = deduceMoveTypesGeometry(position('h7'), position('h5'), 'white', false, true);
        const moved = pieces.map(piece => piece.id === before[0].id ? { ...piece, state: piece.state & allowed } : piece);
        const after = resolveQuantumState(moved).filter(piece => piece.owner === 'white');
        expect(after.slice(0, 5).map(piece => piece.state)).toEqual(learningChain.pieces.map(piece => mask(piece.after)));
        expect(after[6].state).toBe(PIECE_ROOK);
        expect(after[6].alive).toBe(false);
    });
    it.each(['ja', 'en'] as const)('provides readable articles and native answers without sign-in or JavaScript in %s', lang => {
        const c = learningCopy[lang];
        const guide = renderToStaticMarkup(createElement(LearningArticle, { kind: 'guide', lang }));
        const faq = renderToStaticMarkup(createElement(LearningArticle, { kind: 'faq', lang }));
        for (const step of c.steps) expect(guide).toContain(step.text);
        for (const exercise of c.exercises) expect(guide).toContain(exercise.answer);
        expect(guide).toContain('data-learning-chain');
        expect(guide).toContain(c.chainFixed);
        for (const reason of c.chainReasons) expect(guide).toContain(reason);
        for (const item of c.faqs) {
            expect(faq).toContain(item.answer);
            expect(faq).toContain(`href="${item.href.replace(/\/(?=#|$)/g, '')}"`);
        }
        expect(guide.match(/<details\b/g)).toHaveLength(3);
        expect(faq.match(/<details\b/g)).toHaveLength(9);
        for (const html of [guide, faq]) {
            expect(html).toContain(`lang="${lang}"`);
            expect(html).not.toContain('undefined');
            expect(html).not.toContain('role="dialog"');
            expect(html).toContain('href="/"');
        }
    });
    it('keeps the learning entrance in the existing homepage introduction', () => {
        for (const Component of [LearningEntry, SiteIntroduction]) {
            const html = renderToStaticMarkup(createElement(Component, { lang: 'ja' }));
            expect(html).toContain('data-learning-entry');
            expect(html).toContain('href="/guide"');
            expect(html).toContain('href="/faq"');
        }
    });
    it('renders a complete initial article and distinct canonical metadata', () => {
        for (const kind of ['guide', 'faq'] as const) {
            const html = renderToStaticMarkup(createElement(LearningPage, { kind }));
            expect(html).toContain(`data-learning-article="${kind}"`);
            expect(html).toContain('<main lang="ja"');
        }
        expect(guideMetadata.alternates?.canonical).toBe('/guide/');
        expect(faqMetadata.alternates?.canonical).toBe('/faq/');
        expect(guideMetadata.description).not.toBe(faqMetadata.description);
    });
});
