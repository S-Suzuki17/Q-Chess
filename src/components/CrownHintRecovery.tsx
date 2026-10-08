'use client';

import { useEffect, useState } from 'react';
import { useTicketHint } from '../hooks/useTicketHint';
import { readCrownHintRecovery, readMatchHintRecovery, readLastMatchHintRecovery, type SavedHintRecovery as Recovery, type MatchHintContext } from '../lib/paidHints';
import { hintAdviceText } from '../locales/hintAdviceText';
import { hintErrorText, moveHintText } from '../locales/moveHintText';
import type { Language } from '../locales/dict';
import { QubeTeacher } from './QubeTeacher';

const square = (row: number, col: number) => `${String.fromCharCode(97 + col)}${8 - row}`;

/** Historical receipts are available on the selector after a reload; no stage is activated. */
export function CrownHintRecovery({ userId, lang }: { userId: string; lang: Language }) {
    return <SavedHintRecovery userId={userId} lang={lang}/>;
}
export function SavedMatchHintRecovery({ userId, lang, matchId, mode }: { userId: string; lang: Language; matchId: string; mode: MatchHintContext['mode'] }) {
    return <SavedHintRecovery userId={userId} lang={lang} matchId={matchId} mode={mode}/>;
}
export function LatestMatchHintRecovery({userId,lang}:{userId:string;lang:Language}) {
    return <SavedHintRecovery userId={userId} lang={lang} latestMatch/>;
}
function SavedHintRecovery({ userId, lang, matchId, mode, latestMatch=false }: { userId: string; lang: Language; matchId?: string; mode?: MatchHintContext['mode'];latestMatch?:boolean }) {
    const scope=`${userId}:${matchId??(latestMatch?'latest-match':'crown')}:${mode??'crown'}`;
    const [saved, setSaved] = useState<{ scope: string; value: Recovery | null; error?: unknown } | null>(null);
    useEffect(() => {
        try { setSaved({ scope, value: latestMatch?readLastMatchHintRecovery(userId):matchId&&mode?readMatchHintRecovery(userId,matchId,mode):readCrownHintRecovery(userId) }); }
        catch (error) { setSaved({ scope, value: null, error }); }
    }, [userId,matchId,mode,scope,latestMatch]);
    const current = saved?.scope === scope ? saved : null;
    const hint = useTicketHint({ userId, context: current?.value?.context ?? null,
        revision: current?.value?.attempt.revision ?? 0, eligible: false });
    if (!current?.value && !current?.error) return null;
    const text = moveHintText(lang), receipt = hint.recovered;
    const error = hint.error ?? current?.error;
    return <QubeTeacher lang={lang} className="crown-hint-recovery">
        <strong>{text.saved}</strong>
        <p>{text.historical}</p>
        {hint.hasRecovery && <button className="campaign-primary" disabled={hint.pending} aria-busy={hint.pending}
            onClick={() => void hint.recover()}>{hint.pending ? text.thinking : text.recover}</button>}
        <div role="status" aria-live="polite">
            {error != null && <p>{hintErrorText(lang, error)}</p>}
            {receipt && <p data-crown-saved-hint>{square(receipt.hint.fromRow, receipt.hint.fromCol)} → {square(receipt.hint.toRow, receipt.hint.toCol)}
                {hintAdviceText(lang, receipt.hint) && <span> · {hintAdviceText(lang, receipt.hint)}</span>}</p>}
        </div>
    </QubeTeacher>;
}
