import {describe, expect, it} from 'vitest';
import {textPageBreaks} from './textPageBreaks';

describe('localized explanation pages', () => {
    it.each([
        ['en', 'Keep the opponent king on the board.'],
        ['ja', '相手のキングをチェックメイトしよう。候補は複数残せます。'],
        ['zh', '保留多种候选身份，将对手的王将死。'],
        ['de', 'Die Schachschule erklärt die Rochade.'],
        ['fr', 'Déplacez votre cavalier pour commencer.'],
        ['es', 'Aprende el movimiento de cada pieza.'],
        ['pt', 'Aprenda o movimento de cada peça.'],
        ['ru', 'Сначала научимся двигать фигуры.'],
        ['tr', 'Önce taşların hareketlerini öğrenelim.'],
        ['pl', 'Najpierw poznaj ruchy wszystkich figur.'],
        ['hi', 'पहले मोहरों की चाल चलना सीखें।'],
        ['ta', 'முதலில் காய்களை நகர்த்தக் கற்றுக்கொள்வோம்.'],
    ])('preserves every grapheme and prefers words in %s', (lang, text) => {
        const {chars, pageEnd} = textPageBreaks(text, lang);
        const pages: string[] = [];
        const wordEnds = new Set(Array.from(new Intl.Segmenter(lang, {granularity: 'word'}).segment(text), part => part.index + part.segment.length));
        let start = 0, offset = 0;
        while (start < chars.length) {
            const end = pageEnd(start, 16);
            expect(end).toBeGreaterThan(start);
            expect(end).toBeLessThanOrEqual(Math.min(start + 16, chars.length));
            const page = chars.slice(start, end).join('');
            offset += page.length;
            if (end < chars.length && end < start + 16) expect(wordEnds.has(offset)).toBe(true);
            pages.push(page); start = end;
        }
        expect(pages.join('')).toBe(text);
    });

    it('moves a whole word onto the next page even if its first half would fit', () => {
        const {chars, pageEnd} = textPageBreaks('Now Schachschule begins.', 'de');
        expect(chars.slice(0, pageEnd(0, 12)).join('')).toBe('Now ');
    });

    it('keeps closing punctuation with the preceding word', () => {
        const {chars, pageEnd} = textPageBreaks('Move “your knight”, then continue.', 'en');
        expect(chars.slice(0, pageEnd(0, 16)).join('')).toBe('Move “your ');
    });

    it('falls back only at grapheme boundaries for a single word larger than a page', () => {
        const {chars, pageEnd} = textPageBreaks('👩🏽‍💻supercalifragilisticexpialidocious', 'en');
        expect(chars[0]).toBe('👩🏽‍💻');
        expect(pageEnd(1, 8)).toBe(9);
    });
});
