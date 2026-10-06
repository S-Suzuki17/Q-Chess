import type { Language } from '../locales/dict';
import { commerceStatusText } from '../locales/commerceStatusText';
import { stripeMembershipText } from '../locales/stripeMembershipText';
import type { StripeCommerceStatus } from '../lib/stripeMembership';

/** Read-only, mode-specific stock. No purchase action, prices, or legacy expiry rules. */
export function CommerceEntitlements({ status, lang }: { status: StripeCommerceStatus; lang: Language }) {
    if (!status.active && status.balances.purchased === 0 && status.balances.subscription === 0) return null;
    const copy = commerceStatusText(lang), membership = stripeMembershipText(lang);
    return <div data-commerce-entitlements data-commerce-mode={status.livemode ? 'live' : 'test'}>
        <h5 className="reward-title">{copy.hints}{!status.livemode ? ` · ${copy.testMode}` : ''}</h5>
        {!status.livemode && <p role="status">{copy.testNotice}</p>}
        {status.active && <p role="status">
            {status.sku === 'plus_monthly' ? 'Plus' : 'Standard'} · {membership.active}
            {status.periodEnd ? ` · ${status.cancelAtPeriodEnd ? membership.scheduledEnd : membership.periodEnd}: ${new Date(status.periodEnd).toISOString().slice(0, 10)} UTC` : ''}
        </p>}
        {status.livemode && status.active && status.unlimitedRanked && status.adFree && <p>{copy.benefits}</p>}
        <dl className="reward-balances">
            <div className="reward-balance"><dt>{copy.purchased}</dt><dd>{status.balances.purchased}</dd></div>
            <div className="reward-balance"><dt>{copy.subscription}</dt><dd>{status.balances.subscription}</dd></div>
        </dl>
    </div>;
}
