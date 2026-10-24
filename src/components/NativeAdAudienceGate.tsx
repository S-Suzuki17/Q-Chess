'use client';
import {useEffect, useRef, useState} from 'react';
import {useAndroidBackHandler} from '../hooks/useAndroidBack';
import {AD_AGE_GROUPS, ensureAdAudience, registerAdAudiencePrompt, type AdAgeGroup} from '../lib/nativeAdAudience';
import {adAudienceText} from '../locales/adAudienceText';

export function NativeAdAudienceSettings({lang, locked}: {lang: string; locked: boolean}) {
    return <button type="button" disabled={locked} className="block min-h-11 w-full rounded border border-[#4A4238] p-3" onClick={() => void ensureAdAudience(true)}>{adAudienceText(lang)[0]}</button>;
}
export function NativeAdAudienceGate({lang}: {lang: string}) {
    const [open, setOpen] = useState(false), [choice, setChoice] = useState<AdAgeGroup | null>(null);
    const dialog = useRef<HTMLDialogElement>(null), finish = useRef<((value: AdAgeGroup | null) => void) | null>(null);
    const text = adAudienceText(lang);
    const close = (value: AdAgeGroup | null) => { const resolve = finish.current; finish.current = null; setOpen(false); resolve?.(value); };
    useEffect(() => registerAdAudiencePrompt(resolve => { finish.current = resolve; setChoice(null); setOpen(true); }), []);
    useEffect(() => { const node = dialog.current; if (open) node?.showModal(); else node?.close(); return () => node?.close(); }, [open]);
    useAndroidBackHandler(() => { if (!open) return false; close(null); return true; }, 100);
    return <dialog ref={dialog} data-ad-audience-dialog aria-labelledby="ad-audience-title" aria-describedby="ad-audience-description" className="m-auto max-h-[90dvh] w-[min(92vw,28rem)] overflow-y-auto rounded-2xl border border-[#4A4238] bg-[#1A1714] p-5 text-[#EFE5D5] backdrop:bg-black/70" onCancel={event => { event.preventDefault(); close(null); }}>
        <h2 id="ad-audience-title" className="text-xl font-semibold" tabIndex={-1} autoFocus>{text[0]}</h2>
        <p id="ad-audience-description" className="my-4 text-sm leading-relaxed">{text[1]}</p>
        <fieldset className="grid gap-2"><legend className="sr-only">{text[0]}</legend>{AD_AGE_GROUPS.map((value, index) => <label key={value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-[#4A4238] p-3"><input type="radio" name="ad-age-range" value={value} checked={choice === value} onChange={() => setChoice(value)}/><span>{text[index + 2]}</span></label>)}</fieldset>
        <div className="mt-4 grid gap-2"><button type="button" className="min-h-12 rounded-lg border border-[#B59A65] p-3 disabled:opacity-40" disabled={!choice} onClick={() => close(choice)}>{text[6]}</button><button type="button" className="min-h-12 rounded-lg p-3" onClick={() => close(null)}>{text[7]}</button></div>
    </dialog>;
}
