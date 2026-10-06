import type { Language } from '../locales/dict';
import { dict } from '../locales/dict';
import { cancelledRankedText } from '../locales/rankedText';
import { isRankedLimitReason, rankedLimitText } from '../locales/rankedLimitText';

export function RankedCancellationNotice({lang,reason,onHome}:{lang:Language;reason:string|null;onHome:()=>void}) {
    const limit = isRankedLimitReason(reason) ? rankedLimitText(lang) : null;
    return <div role="alert" className="m-auto w-[min(92vw,448px)] rounded-xl border border-[#B39A62]/30 bg-[#161513] p-6 text-center text-[#E8E2D7]">
        {limit ? <><h2 className="text-xl font-semibold mb-3">{limit.title}</h2><p className="text-sm leading-relaxed">{limit.detail}</p></> : <p>{cancelledRankedText(lang)}</p>}
        
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button className="min-h-11 border border-[#B39A62]/40 px-6 hover:bg-[#B39A62]/10 transition-colors" onClick={onHome}>
                {dict[lang].home}
            </button>
            {isRankedLimitReason(reason) && (
                <button className="min-h-11 bg-gradient-to-r from-[#D4B872]/80 to-[#B39A62]/80 hover:from-[#D4B872] hover:to-[#B39A62] text-[#11100E] font-bold px-6 shadow-[0_0_15px_rgba(212,184,114,0.3)] transition-all" 
                    onClick={() => { onHome(); setTimeout(() => document.querySelector<HTMLElement>('[data-rewards-entry="lobby"]')?.click(), 100); }}>
                    {lang === 'ja' ? 'ストアでチケットを入手' : 'Get Tickets in Store'}
                </button>
            )}
        </div>

    </div>;
}
