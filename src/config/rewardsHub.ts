import { DAILY_LOGIN_REWARDS_ENABLED } from '../lib/dailyLoginRewards';
import { RANKED_REFUND_BALANCE_ENABLED } from '../lib/rankedRefundBalance';
import { MEMBER_TICKET_USAGE_ENABLED, STRIPE_WEB_MEMBERSHIP_ENABLED, STRIPE_WEB_PORTAL_ENABLED } from '../lib/stripeMembership';

// Each panel keeps its own access/platform/API gates. This controls navigation only.
export const rewardsHubEnabled = () => DAILY_LOGIN_REWARDS_ENABLED || MEMBER_TICKET_USAGE_ENABLED ||
    RANKED_REFUND_BALANCE_ENABLED || STRIPE_WEB_MEMBERSHIP_ENABLED || STRIPE_WEB_PORTAL_ENABLED;
