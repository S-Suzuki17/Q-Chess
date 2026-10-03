import type { Language } from '../locales/dict';
import { dict } from '../locales/dict';
import { cancelledRankedText } from '../locales/rankedText';
import { isRankedLimitReason, rankedLimitText } from '../locales/rankedLimitText';

export function RankedCancellationNotice({lang,reason,onHome}:{lang:Language;reason:string|null;onHome:()=>void}) {
    const limit = isRankedLimitReason(reason) ? rankedLimitText(lang) : null;
    return <div role="alert" className="m-auto w-[min(92vw,448px)] rounded-xl border border-[#B39A62]/30 bg-[#161513] p-6 text-center text-[#E8E2D7]">
        {limit ? <><h2 className="text-xl font-semibold mb-3">{limit.title}</h2><p className="text-sm leading-relaxed">{limit.detail}</p></> : <p>{cancelledRankedText(lang)}</p>}
        <button className="mt-4 min-h-11 border border-[#B39A62]/40 px-6" onClick={onHome}>{dict[lang].home}</button>
    </div>;
}
