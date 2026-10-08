import { dict, type Language } from './dict';
import { matchText } from './matchText';
import type { HintMove } from '../components/boardPresentation';

/** Also used for read-only receipt recovery, so special choices are not lost. */
export function hintAdviceText(lang: string, hint: HintMove | null): string | null {
    if (!hint) return null;
    const vocabulary = dict[lang as Language] ?? dict.en;
    const promotion = ({ 16: ['クイーン', 'Queen'], 8: ['ルーク', 'Rook'],
        4: ['ビショップ', 'Bishop'], 2: ['ナイト', 'Knight'] } as Record<number, [string, string]>)[hint.promotionTarget ?? 0];
    if (promotion) return `${vocabulary.promotionTitle}: ${matchText(lang, ...promotion)}`;
    if (hint.declinePromotion) return vocabulary.promotionCancel;
    return hint.intention === 'castle' ? vocabulary.castlingOption
        : hint.intention === 'normal' ? vocabulary.normalMoveOption : null;
}
