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
            let realWhite = whiteId.startsWith('anon_') ? whiteId.replace('anon_', '') : whiteId;
            let realBlack = blackId.startsWith('anon_') ? blackId.replace('anon_', '') : blackId;

            if (realWhite === 'ai' || realBlack === 'ai' || realWhite.startsWith('GUEST-') || realBlack.startsWith('GUEST-') || realWhite === '' || realBlack === '') {
                console.log(`[DB] Skipping DB rating update for AI/Guest match ${matchId}`);
                return true;
            }

            console.log(`[DB] Recording match ${matchId}: White=${realWhite}, Black=${realBlack}, Winner=${winner}`);

            // 1. Fetch current profiles for both players
            const [whiteRes, blackRes] = await Promise.all([
                this.supabase.from('profiles').select('*').eq('id', realWhite).single(),
                this.supabase.from('profiles').select('*').eq('id', realBlack).single()
            ]);

            let whiteProfile = whiteRes.data;
            let blackProfile = blackRes.data;

            // Ensure profile exists if missing
            if (!whiteProfile) {
                const { data } = await this.supabase.from('profiles').insert({
                    id: realWhite,
                    name: 'Player',
                    rating: 2000,
                    rating_10m: 2000,
                    rating_3m: 2000,
                    rating_10s: 2000
                }).select().single();
                whiteProfile = data;
            }

            if (!blackProfile) {
                const { data } = await this.supabase.from('profiles').insert({
                    id: realBlack,
                    name: 'Player',
                    rating: 2000,
                    rating_10m: 2000,
                    rating_3m: 2000,
                    rating_10s: 2000
                }).select().single();
                blackProfile = data;
            }

            const whiteRating = whiteProfile?.rating_10m ?? whiteProfile?.rating ?? 2000;
            const blackRating = blackProfile?.rating_10m ?? blackProfile?.rating ?? 2000;

            const scoreWhite = winner === 'WHITE' ? 1.0 : winner === 'BLACK' ? 0.0 : 0.5;
            const { newA: newWhiteRating, newB: newBlackRating } = this.calculateElo(whiteRating, blackRating, scoreWhite, 32);

            console.log(`[DB] Rating Updated: White(${whiteRating} -> ${newWhiteRating}), Black(${blackRating} -> ${newBlackRating})`);

            // 2. Update profiles in parallel
            await Promise.all([
                this.supabase.from('profiles').update({
                    rating: newWhiteRating,
                    rating_10m: newWhiteRating
                }).eq('id', realWhite),

                this.supabase.from('profiles').update({
                    rating: newBlackRating,
                    rating_10m: newBlackRating
                }).eq('id', realBlack)
            ]);

            // 3. Save match record to game_records table
            const winnerString = winner === 'WHITE' ? 'white_wins' : winner === 'BLACK' ? 'black_wins' : 'draw';
            await this.supabase.from('game_records').insert({
                white_player: whiteProfile?.name || 'White',
                black_player: blackProfile?.name || 'Black',
                white_id: realWhite,
                black_id: realBlack,
                winner: winnerString,
                mode: 'random',
                time_control: '10m',
                moves: [],
                total_moves: history.length
            });

            console.log(`[DB] Match ${matchId} and Ratings recorded successfully.`);
            return true;
        } catch (error) {
            console.error(`[DB] Error recording match ${matchId}:`, error);
            return false;
        }
    }

    // Auto cleanup old game records to save DB storage space
    public async cleanupOldRecords(days: number = 30): Promise<void> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            const { error, count } = await this.supabase
                .from('game_records')
                .delete({ count: 'exact' })
                .lt('created_at', cutoffDate.toISOString());

            if (error) {
                console.error('[DB Cleanup] Error deleting old game records:', error);
            } else {
                console.log(`[DB Cleanup] Purged ${count ?? 0} game records older than ${days} days.`);
            }
        } catch (e) {
            console.error('[DB Cleanup] Exception during cleanup:', e);
        }
    }
}
