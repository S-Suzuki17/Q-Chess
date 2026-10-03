import { afterEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cpuHintTicketsEnabled, dailyLoginRewardsEnabled, rankedTicketAdmissionEnabled,rankedAdmissionRecoveryEnabled } from './TicketFeatureGates';
import { SupabaseService } from './SupabaseService';

afterEach(() => vi.unstubAllEnvs());

it('cannot release unfinished ticket flows with environment variables alone', async () => {
    vi.stubEnv('RANKED_TICKET_ADMISSION_ENABLED', 'true');
    vi.stubEnv('RANKED_ADMISSION_RECOVERY_ENABLED', 'true');
    vi.stubEnv('CPU_HINT_TICKETS_ENABLED', 'true');
    vi.stubEnv('DAILY_LOGIN_REWARDS_ENABLED', 'true');
    expect(rankedTicketAdmissionEnabled()).toBe(false);
    expect(rankedAdmissionRecoveryEnabled()).toBe(false);
    expect(cpuHintTicketsEnabled()).toBe(false);
    expect(dailyLoginRewardsEnabled()).toBe(false);

    const rpc = vi.fn(() => { throw new Error('Ticket DB must not be touched'); });
    const service = new SupabaseService({ rpc } as unknown as SupabaseClient);
    await expect(service.admitRankedMatch('match', 'Alice', 'ai:match', 600))
        .rejects.toThrow('RANKED_TICKET_ADMISSION_DISABLED');
    await expect(service.voidRankedAdmission('match')).rejects.toThrow('RANKED_TICKET_ADMISSION_DISABLED');
    await expect(service.cpuPracticeService().requestHint('request', 'Alice', [], 'white'))
        .rejects.toThrow('CPU_PRACTICE_DISABLED');
    expect(rpc).not.toHaveBeenCalled();
});
