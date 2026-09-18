import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {v5 as uuidv5} from 'uuid';
import { parseLocalGameRecord, PRIVATE_RECORD_LIMIT } from './PrivateGameRecords';
import type { LocalGameRecord, PrivateGameRecord, PrivateGameStats } from './PrivateGameRecords';
import { createProfileAvatarStore } from './ProfileAvatars';

dotenv.config();

// Kept equal to the Web creation default and profiles column defaults.
export const INITIAL_RATING = 1000;
export interface RatingChange {userId:string;before:number;after:number;delta:number}
export interface RankedSettlement {white?:RatingChange;black?:RatingChange;timeControl:number}

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key';

export class SupabaseService {
    private supabase: SupabaseClient;
    private ratingRequests = new Map<string, Promise<number | null>>();
    private pendingAuth=0;

    constructor(client?: SupabaseClient) {
        this.supabase = client ?? createClient(supabaseUrl, supabaseKey,{
            auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
            global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(5000)])})}
        });
    }

    public profileAvatarStore() {
        return createProfileAvatarStore(this.supabase,token=>this.verifyUser(token));
    }

    public async verifyLegacyPassword(userId:string,password:string):Promise<boolean> {
        try {
            const {data,error}=await this.supabase.rpc('login_user',{p_id:userId,p_password:password}).abortSignal(AbortSignal.timeout(4000));
            return !error && data===true;
        } catch { return false; }
    }

    public async rankedReady():Promise<boolean> {
        try {
            const {data,error}=await this.supabase.rpc('ranked_protocol_version').abortSignal(AbortSignal.timeout(3000));
            return !error && data===1;
        } catch { return false; }
    }

    public async getPrivateGameRecords(userId:string, limit=PRIVATE_RECORD_LIMIT):Promise<PrivateGameRecord[]> {
        const safeLimit = Number.isInteger(limit) ? Math.max(1,Math.min(limit,PRIVATE_RECORD_LIMIT)) : PRIVATE_RECORD_LIMIT;
        const {data,error}=await this.supabase.rpc('get_private_game_records',{p_user_id:userId,p_limit:safeLimit})
            .abortSignal(AbortSignal.timeout(5000));
        if(error||!Array.isArray(data))throw new Error('Private history unavailable');
        return data.filter(row=>row && (row.white_id===userId||row.black_id===userId)).slice(0,safeLimit) as PrivateGameRecord[];
    }

    public async getPrivateGameStats(userId:string):Promise<PrivateGameStats> {
        const {data,error}=await this.supabase.rpc('get_private_game_stats',{p_user_id:userId}).abortSignal(AbortSignal.timeout(5000));
        const fields=['totalGames','wins','losses','draws','whiteGames','whiteWins','blackGames','blackWins'];
        if(error||!data||typeof data!=='object'||fields.some(key=>!Number.isSafeInteger(data[key])||data[key]<0))throw new Error('Private statistics unavailable');
        return Object.fromEntries(fields.map(key=>[key,data[key]])) as unknown as PrivateGameStats;
    }

    public async saveLocalGameRecord(userId:string, input:LocalGameRecord):Promise<string> {
        const record=parseLocalGameRecord(input,userId);
        if(!record)throw new Error('Invalid local record');
        const {data:profile,error:profileError}=await this.supabase.from('profiles').select('name').eq('id',userId)
            .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
        if(profileError||!profile)throw new Error('Profile unavailable');
        const name=typeof profile.name==='string'&&profile.name.trim()?profile.name.slice(0,80):'Player';
        // Namespace client IDs by authenticated owner. A client cannot overwrite
        // another user's record or impersonate a server-owned match UUID.
        const id=uuidv5(`q-gambit:local:${record.mode}:${userId}:${record.id}`,uuidv5.URL);
        const opponentName=record.mode==='cpu'?'CPU':'Opponent';
        const {error}=await this.supabase.from('game_records').upsert({...record,id,
            white_player:record.white_id===userId?name:opponentName,black_player:record.black_id===userId?name:opponentName,
        },{onConflict:'id',ignoreDuplicates:true}).abortSignal(AbortSignal.timeout(5000));
        if(error)throw new Error('Local history save unavailable');
        return id;
    }

    public async settleRankedMatch(match:import('../matchmaking/MatchmakingService').MatchSession):Promise<RankedSettlement|null> {
        const state=match.engine?.getPublicState(match.players.host);
        if(match.mode!=='ranked'||!state?.gameOver)return null;
        try {
            const {data,error}=await this.supabase.rpc('settle_ranked_match',{
                p_match_id:match.matchId,p_white_id:match.players.host,p_black_id:match.players.joiner,
                p_winner:state.gameOver,p_time_control:match.timeControl,
                p_cpu_id:match.cpu?.id??null,p_cpu_rating:match.cpu?.profile.rating??null,p_cpu_level:match.cpu?.profile.level??null,
                p_history:match.engine!.getHistory()
            }).abortSignal(AbortSignal.timeout(5000));
            if(error||!data||typeof data!=='object')return null;
            return data as RankedSettlement;
        } catch { return null; }
    }

    /** Casual/private games retain history but must never use the legacy Elo writer. */
    public async recordUnratedMatch(match:import('../matchmaking/MatchmakingService').MatchSession):Promise<void> {
        const state=match.engine?.getPublicState(match.players.host);
        if(match.mode==='ranked'||!state?.gameOver)return;
        const id=/^[0-9a-f-]{36}$/i.test(match.matchId)?match.matchId:uuidv5(`${match.matchId}:${match.createdAt}`,uuidv5.URL);
        try {
            const {error}=await this.supabase.from('game_records').upsert({id,
                white_player:match.playerNames.host||'White',black_player:match.playerNames.joiner||'Black',
                white_id:match.players.host,black_id:match.players.joiner,
                winner:state.gameOver==='WHITE'?'white_wins':state.gameOver==='BLACK'?'black_wins':'draw',
                mode:'random',time_control:match.timeControl===10?'10s':match.timeControl===180?'3m':'10m',
                moves:match.engine!.getHistory(),total_moves:state.moveCount
            },{onConflict:'id',ignoreDuplicates:true}).abortSignal(AbortSignal.timeout(5000));
            if(error)console.warn('[DB] Unrated history save failed');
        }catch{console.warn('[DB] Unrated history unavailable');}
    }

    /** Read only the actual match-mode rating; no client-supplied or invented badge. */
    public getMatchRating(userId: string, timeControl: number): Promise<number | null> {
        if (!userId || userId === 'ai' || userId.startsWith('GUEST-') || userId.startsWith('anon_')) return Promise.resolve(null);
        const column = timeControl === 10 ? 'rating_10s' : timeControl === 180 ? 'rating_3m' : 'rating_10m';
        const key = `${column}:${userId}`;
        const pending = this.ratingRequests.get(key);
        if (pending) return pending;
        const request = (async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);
            try {
                const { data, error } = await this.supabase.from('profiles').select(column).eq('id', userId).abortSignal(controller.signal).maybeSingle();
                if (error) return null;
                const rating = (data as unknown as Record<string, unknown> | null)?.[column];
                return typeof rating === 'number' && Number.isFinite(rating) && rating >= 0 ? rating : null;
            } catch { return null; }
            finally { clearTimeout(timeout); }
        })();
        this.ratingRequests.set(key, request);
        void request.finally(() => this.ratingRequests.delete(key));
        return request;
    }

    // Verify JWT and extract user info
    public async verifyUser(token: string): Promise<string | null> {
        if (typeof token!=='string'||token.length>8192||!/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token)||this.pendingAuth>=32) return null;
        this.pendingAuth++;
        try {
            const { data: { user }, error } = await this.supabase.auth.getUser(token);
            if (error || !user || user.is_anonymous===true) return null;
            return user.id;
        } catch (e) {
            return null;
        } finally {this.pendingAuth--;}
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
            let realWhite = whiteId;
            let realBlack = blackId;

            if (realWhite === 'ai' || realBlack === 'ai' || realWhite.startsWith('GUEST-') || realBlack.startsWith('GUEST-') || realWhite === '' || realBlack === '') {
                console.log(`[DB] Skipping DB rating update for AI/Guest match ${matchId}`);
                return true;
            }

            console.log(`[DB] Recording match ${matchId}: White=${realWhite}, Black=${realBlack}, Winner=${winner}`);

            // 1. Fetch current profiles for both players
            const [whiteRes, blackRes] = await Promise.all([
                this.supabase.from('profiles').select('*').eq('id', realWhite).maybeSingle(),
                this.supabase.from('profiles').select('*').eq('id', realBlack).maybeSingle()
            ]);

            // A failed lookup must never reset an existing player's rating.
            if (whiteRes.error || blackRes.error) return false;

            let whiteProfile = whiteRes.data;
            let blackProfile = blackRes.data;

            // Ensure profile exists if missing
            if (!whiteProfile) {
                const { data, error } = await this.supabase.from('profiles').insert({
                    id: realWhite,
                    name: 'Player',
                    rating: INITIAL_RATING,
                    rating_10m: INITIAL_RATING,
                    rating_3m: INITIAL_RATING,
                    rating_10s: INITIAL_RATING
                }).select().single();
                if (error || !data) return false;
                whiteProfile = data;
            }

            if (!blackProfile) {
                const { data, error } = await this.supabase.from('profiles').insert({
                    id: realBlack,
                    name: 'Player',
                    rating: INITIAL_RATING,
                    rating_10m: INITIAL_RATING,
                    rating_3m: INITIAL_RATING,
                    rating_10s: INITIAL_RATING
                }).select().single();
                if (error || !data) return false;
                blackProfile = data;
            }

            const whiteRating = whiteProfile?.rating_10m ?? whiteProfile?.rating ?? INITIAL_RATING;
            const blackRating = blackProfile?.rating_10m ?? blackProfile?.rating ?? INITIAL_RATING;

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

}
