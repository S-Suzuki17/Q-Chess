import { randomUUID } from 'node:crypto';
import { isMatchUuid, type SharedMatchChoice } from '../protocol/SharedMatchAdmission';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MatchSession } from '../matchmaking/MatchmakingService';
import type { RankedSettlement } from './SupabaseService';

export type AdmissionState = 'active' | 'settled' | 'voided' | 'rejected' | 'missing' | 'choice_required';
export interface AdmissionOutcome {
    state: AdmissionState;
    success?: boolean;
    duplicate?: boolean;
    reason?: string;
    matchId?: string;
    ownerId?: string;
    humanIds?: string[];
    timeControl?: number;
    result?: RankedSettlement;
}
export interface RankedAdmissionStore {
    choice?(userId: string, choice: SharedMatchChoice): Promise<string>;
    finishOnline?(matchId: string, ownerId: string): Promise<AdmissionOutcome>;
    renew(ownerId: string): Promise<boolean>;
    admit(match: MatchSession, ownerId: string): Promise<AdmissionOutcome>;
    void(matchId: string, ownerId: string, reason: string): Promise<AdmissionOutcome>;
    recover(): Promise<AdmissionOutcome[]>;
    read(matchId: string, userId: string): Promise<AdmissionOutcome | null>;
    busy(userId: string): Promise<boolean>;
}
export function createRankedAdmissionStore(client: SupabaseClient, enabled: () => boolean, canAdmit=enabled, shared=false): RankedAdmissionStore {
    let readiness:Promise<void>|undefined;
    const rpc = async (name: string, parameters: Record<string, unknown>) => {
        if (!enabled()) throw new Error('RANKED_TICKET_ADMISSION_DISABLED');
        const { data, error } = await client.rpc(name, parameters).abortSignal(AbortSignal.timeout(5000));
        if (error) throw error;
        return data;
    };
    const outcome = (data: unknown): AdmissionOutcome => {
        if (!data || typeof data !== 'object' || !['active','settled','voided','rejected','missing',...(shared?['choice_required']:[])].includes((data as AdmissionOutcome).state))
            throw new Error('RANKED_ADMISSION_RESPONSE_INVALID');
        const row=data as AdmissionOutcome;
        if(row.state==='choice_required'&&(!Array.isArray(row.humanIds)||row.humanIds.length<1||row.humanIds.length>2
            ||row.humanIds.some(id=>typeof id!=='string'||!id)||!isMatchUuid(row.matchId)))
            throw new Error('RANKED_ADMISSION_RESPONSE_INVALID');
        return row;
    };
    const boolean = (data:unknown) => {
        if(typeof data!=='boolean')throw new Error('RANKED_ADMISSION_RESPONSE_INVALID');
        return data;
    };
    return {
        ...(shared ? {
            async choice(userId: string, choice: SharedMatchChoice) {
                if (!canAdmit()) throw new Error('SHARED_MATCH_ADMISSION_DISABLED');
                const token = await rpc('issue_shared_match_consent', { p_token: randomUUID(), p_user_id: userId,
                    p_match_id: choice.matchId, p_source: choice.source, p_grant_id: choice.grantId ?? null });
                if (!isMatchUuid(token)) throw new Error('RANKED_ADMISSION_RESPONSE_INVALID');
                return token;
            },
            async finishOnline(matchId: string, ownerId: string) {
                return outcome(await rpc('finish_shared_online_match', { p_match_id: matchId, p_owner_id: ownerId }));
            },
        } : {}),
        async renew(ownerId) {
            readiness??=rpc(shared?'shared_match_admission_protocol_version':'ranked_admission_protocol_version',{}).then(version=>{
                if(version!==(shared?1:2))throw new Error('RANKED_ADMISSION_RESPONSE_INVALID');
            }).catch(error=>{readiness=undefined;throw error;});
            await readiness;
            return boolean(await rpc('renew_ranked_server_lease', { p_owner_id: ownerId }));
        },
        async admit(match, ownerId) {
            if(!canAdmit())throw new Error('RANKED_TICKET_ADMISSION_DISABLED');
            return outcome(await rpc(shared?'admit_shared_match':'admit_ranked_match', {
                ...(shared?{p_mode:match.mode,p_consents:match.admissionConsents??{}}:{}),
                p_match_id: match.matchId, p_host_id: match.players.host, p_joiner_id: match.players.joiner,
                p_time_control: match.timeControl, p_owner_id: ownerId, p_cpu_id: match.cpu?.id ?? null,
                p_cpu_rating: match.cpu?.profile.rating ?? null, p_cpu_level: match.cpu?.profile.level ?? null,
            }));
        },
        async void(matchId, ownerId, reason) {
            return outcome(await rpc('void_ranked_admission', { p_match_id: matchId, p_owner_id: ownerId, p_reason: reason }));
        },
        async recover() {
            const data = await rpc('recover_expired_ranked_admissions', { p_limit: 100 });
            if (!Array.isArray(data)) throw new Error('RANKED_ADMISSION_RESPONSE_INVALID');
            return data.map(outcome);
        },
        async read(matchId, userId) {
            const data = await rpc('get_ranked_admission', { p_match_id: matchId, p_user_id: userId });
            return data === null ? null : outcome(data);
        },
        async busy(userId) { return boolean(await rpc('ranked_account_busy', { p_user_id: userId })); },
    };
}
