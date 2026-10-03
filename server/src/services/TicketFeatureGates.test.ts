import { afterEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cpuHintTicketsEnabled, dailyLoginRewardsEnabled, rankedTicketAdmissionEnabled,rankedAdmissionRecoveryEnabled } from './TicketFeatureGates';
import { SupabaseService } from './SupabaseService';

afterEach(() => vi.unstubAllEnvs());

it('defaults OFF and never touches ticket storage without explicit deployment switches', async () => {
    vi.stubEnv('RANKED_TICKET_ADMISSION_ENABLED', undefined);
    vi.stubEnv('RANKED_ADMISSION_RECOVERY_ENABLED', undefined);
    vi.stubEnv('CPU_HINT_TICKETS_ENABLED', undefined);
    vi.stubEnv('DAILY_LOGIN_REWARDS_ENABLED', undefined);
    expect(rankedTicketAdmissionEnabled()).toBe(false);
    expect(rankedAdmissionRecoveryEnabled()).toBe(false);
    expect(cpuHintTicketsEnabled()).toBe(false);
    expect(dailyLoginRewardsEnabled()).toBe(false);

    const rpc = vi.fn(() => { throw new Error('Ticket DB must not be touched'); });
    const service = new SupabaseService({ rpc } as unknown as SupabaseClient);
    await expect(service.admitRankedMatch('match', 'Alice', 'ai:match', 600))
        .rejects.toThrow('RANKED_TICKET_ADMISSION_DISABLED');
    await expect(service.voidRankedAdmission('match')).rejects.toThrow('RANKED_TICKET_ADMISSION_DISABLED');
    await expect(service.cpuPracticeService().requestHint('request', 'Alice', 'session', 0))
        .rejects.toThrow('FEATURE_DISABLED');
    expect(rpc).not.toHaveBeenCalled();
});

it.each(['true','false','1','TRUE',' true'])('only exact true enables verified ticket workflows (%s)', value => {
    for (const name of ['RANKED_TICKET_ADMISSION_ENABLED','RANKED_ADMISSION_RECOVERY_ENABLED','CPU_HINT_TICKETS_ENABLED','DAILY_LOGIN_REWARDS_ENABLED']) vi.stubEnv(name,value);
    for (const enabled of [rankedTicketAdmissionEnabled,rankedAdmissionRecoveryEnabled,cpuHintTicketsEnabled,dailyLoginRewardsEnabled]) expect(enabled()).toBe(value==='true');
});

it('keeps admission recovery running when only new ticket admissions are rolled back', () => {
    vi.stubEnv('RANKED_TICKET_ADMISSION_ENABLED','false');
    vi.stubEnv('RANKED_ADMISSION_RECOVERY_ENABLED','true');
    expect(rankedTicketAdmissionEnabled()).toBe(false);
    expect(rankedAdmissionRecoveryEnabled()).toBe(true);
});
