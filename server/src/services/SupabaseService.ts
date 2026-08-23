import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key';

export class SupabaseService {
    private supabase: SupabaseClient;

    constructor() {
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    // Verify JWT and extract user info
    public async verifyUser(token: string): Promise<string | null> {
        if (!token) return null;
        // In a real prod environment we should verify the JWT signature locally or via Supabase.
        // Supabase `getUser(token)` validates the JWT.
        try {
            const { data: { user }, error } = await this.supabase.auth.getUser(token);
            if (error || !user) return null;
            return user.id;
        } catch (e) {
            return null;
        }
    }

    public calculateElo(ratingA: number, ratingB: number, scoreA: number, kFactor: number = 32): { newA: number, newB: number } {
        const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
        const expectedB = 1 - expectedA;

        const newA = Math.round(ratingA + kFactor * (scoreA - expectedA));
        const newB = Math.round(ratingB + kFactor * ((1 - scoreA) - expectedB));

        return { newA, newB };
    }

    public async recordMatchResult(
        matchId: string, 
        whiteId: string, 
        blackId: string, 
        winner: 'WHITE' | 'BLACK' | 'DRAW', 
        history: any[]
    ): Promise<boolean> {
        try {
            // Check if AI match or anon, we might skip DB entirely or handle differently
            if (whiteId === 'ai' || blackId === 'ai' || whiteId.startsWith('anon_') || blackId.startsWith('anon_')) {
                console.log(`[DB] Skipping DB write for AI/Anon match ${matchId}`);
                return true;
            }

            // Use Atomic RPC to prevent partial updates / race conditions (Calculates Elo internally)
            const { data: success, error } = await this.supabase.rpc('record_match_result', {
                p_match_id: matchId,
                p_white_id: whiteId,
                p_black_id: blackId,
                p_winner: winner,
                p_moves: history.length
            });

            if (error) {
                console.error(`[DB] RPC Error recording match ${matchId}:`, error);
                return false;
            }

            if (success) {
                console.log(`[DB] Recorded Match ${matchId} successfully.`);
            } else {
                console.log(`[DB] Match ${matchId} already recorded (Idempotency trigger).`);
            }
            return true;
        } catch (error) {
            console.error(`[DB] Error recording match ${matchId}:`, error);
            return false;
        }
    }
}
