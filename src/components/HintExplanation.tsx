'use client';
import { useMemo } from 'react';
import type { PieceType } from '../config/gameConfig';
import type { Token } from '../lib/GameEngine';
import type { MoveRecord } from '../lib/gameRecordService';
import type { HintMove } from './boardPresentation';
import { explainHint } from '../lib/hintExplanation';
import { hintExplanationText } from '../locales/hintExplanationText';
import { matchText } from '../locales/matchText';

const japaneseNames: Record<PieceType, string> = {
    King: 'キング', Queen: 'クイーン', Rook: 'ルーク', Bishop: 'ビショップ', Knight: 'ナイト', Pawn: 'ポーン',
};

export function HintExplanation({ lang, hint, tokens, candidates, turn, history }: {
    lang: string; hint: HintMove; tokens: Token[];
    candidates?: ReadonlyMap<string, ReadonlySet<PieceType>>;
    turn: 'white' | 'black'; history?: readonly MoveRecord[];
}) {
    const explanation = useMemo(() => explainHint(hint, tokens, candidates, turn, history),
        [hint, tokens, candidates, turn, history]);
    if (!explanation) return null;
    const text = hintExplanationText(lang);
    const names = (types: PieceType[]) => types.map(type => matchText(lang, japaneseNames[type], type)).join(' / ');
    return <details className="hint-explanation" data-testid="hint-explanation">
        <summary>{text.title}</summary>
        {explanation.escapesCheck && <p>{text.escape}</p>}
        {explanation.givesCheck && <p>{text.check}</p>}
        <dl>
            {explanation.capturedSquares.length > 0 && <div><dt>{text.capture}</dt><dd>{explanation.capturedSquares.join(' · ')}</dd></div>}
            <div><dt>{text.after}</dt><dd>{names(explanation.remaining)}</dd></div>
            {explanation.excluded.length > 0 && <div><dt>{text.excluded}</dt><dd>{names(explanation.excluded)}</dd></div>}
            {explanation.otherChanges.length > 0 && <div><dt>{text.chain}</dt>
                <dd>{explanation.otherChanges.map(change => <span key={change.square}>
                    <b>{change.square}</b>: {names(change.remaining)}
                </span>)}</dd></div>}
        </dl>
        <p>{text.scope}</p>
    </details>;
}
