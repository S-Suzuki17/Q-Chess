import type { SupabaseClient } from '@supabase/supabase-js';

export const ENGAGEMENT_EVENTS = [
    'first_visit', 'tutorial_started', 'tutorial_completed',
    'first_match_started', 'first_match_completed',
    'second_match_started', 'next_day_return',
] as const;
export type EngagementEvent = typeof ENGAGEMENT_EVENTS[number];
export type EngagementSubmission = {
    eventId: string;
    eventType: EngagementEvent;
    cohortDay: string;
};
export type EngagementMetricsStore = { record(event: EngagementSubmission): Promise<void> };

/** This service-role client never receives a user token or account identifier. */
export function createEngagementMetricsStore(client: SupabaseClient): EngagementMetricsStore {
    return {
        async record(event) {
            const { error } = await client.from('engagement_events').insert({
                event_id: event.eventId,
                event_type: event.eventType,
                cohort_day: event.cohortDay,
            }).abortSignal(AbortSignal.timeout(3000));
            // A retry with the same random event ID must not increase the count twice.
            if (error && error.code !== '23505') throw new Error('METRICS_UNAVAILABLE');
        },
    };
}
