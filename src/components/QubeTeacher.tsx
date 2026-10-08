import type {ReactNode} from 'react';
import type {Language} from '../locales/dict';
import {qubeTeaching} from '../locales/qubeTeaching';

export function QubeTeacher({lang, children, variant = 'panel', className = ''}: {
    lang: Language; children: ReactNode; variant?: 'panel' | 'compact'; className?: string;
}) {
    const compact = variant === 'compact';
    const language = Object.hasOwn(qubeTeaching, lang) ? lang : 'en';
    return <div data-qube-teacher data-qube-variant={variant} lang={language}
        className={`min-w-0 ${compact ? '' : 'rounded-xl border border-[#6E614C] bg-[#101610] p-4 sm:p-5'} ${className}`}>
        <div className={`flex items-center gap-3 ${compact ? 'mb-3' : 'mb-4'}`}>
            {/* The visible speaker name supplies identity; the portrait is decorative. */}
            <img src="/assets/qube-companion/qube-neutral.svg" alt="" width={compact ? 32 : 48} height={compact ? 32 : 48}
                className={`${compact ? 'h-8 w-8' : 'h-12 w-12'} flex-shrink-0 rounded-lg object-contain`} loading="lazy"/>
            <div className="min-w-0"><span className="font-semibold text-[#D4B872]" data-qube-speaker>QUBE</span>
                <p className="text-sm leading-relaxed text-[#BEB6A8]">{qubeTeaching[language].caption}</p></div>
        </div>
        <div className="min-w-0 space-y-3" data-qube-explanation>{children}</div>
    </div>;
}
