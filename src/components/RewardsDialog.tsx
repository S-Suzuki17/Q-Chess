'use client';

import type { User } from '../types/game';
import { dict, type Language } from '../locales/dict';
import { rewardsHubText } from '../locales/rewardsHubText';
import { SettingsDialog } from './SettingsDialog';
import { DailyLoginRewardsPanel } from './DailyLoginRewardsPanel';
import { CurrentTermsConsentPanel } from './CurrentTermsConsentPanel';
import { MemberTicketsPanel } from './MemberTicketsPanel';
import { RankedRefundBalancePanel } from './RankedRefundBalancePanel';
import { StripeMembershipPanel } from './StripeMembershipPanel';
import { rewardsHubEnabled } from '../config/rewardsHub';

/** A deliberate destination, never an automatic offer or a purchase action. */
export function RewardsDialog({ user, lang, onClose }: { user: User; lang: Language; onClose: () => void }) {
    if (user.type !== 'registered' || !rewardsHubEnabled()) return null;
    const copy = rewardsHubText(lang);
    return <SettingsDialog label={copy.title} onClose={onClose}>
        <div className="rewards-hub">
            <header className="rewards-hub__header">
                <div><h3>{copy.title}</h3><p>{copy.description}</p></div>
                <button type="button" onClick={onClose} aria-label={dict[lang].back} className="rewards-hub__close">×</button>
            </header>
            <div className="rewards-hub__body">
                <DailyLoginRewardsPanel user={user} lang={lang}/>
                <CurrentTermsConsentPanel user={user} lang={lang}/>
                <MemberTicketsPanel user={user} lang={lang}/>
                <RankedRefundBalancePanel user={user} lang={lang}/>
                <StripeMembershipPanel user={user} lang={lang}/>
            </div>
        </div>
    </SettingsDialog>;
}
