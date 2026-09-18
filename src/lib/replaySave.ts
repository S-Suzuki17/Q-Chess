import type { GameRecord } from './gameRecordService';

/** One record identity per mounted game; retries/Strict Mode never create another game. */
export class ReplaySaveSession {
    private id: string | null = null;
    private owner: string | null = null;
    private saved: string | null = null;
    private pending: Promise<string | null> | null = null;
    constructor(private readonly createId: () => string = () => crypto.randomUUID()) {}

    save(record: GameRecord, userId: string, persist: (record: GameRecord, userId: string) => Promise<string | null>): Promise<string | null> {
        if (this.owner !== null && this.owner !== userId) return Promise.resolve(null);
        if (this.saved) return Promise.resolve(this.saved);
        if (this.pending) return this.pending;
        this.owner = userId;
        this.id ??= this.createId();
        const request = Promise.resolve().then(() => persist({ ...record, id: this.id! }, userId))
            .catch(() => null).then(id => { if (id) this.saved = id; return id; })
            .finally(() => { if (this.pending === request) this.pending = null; });
        this.pending = request;
        return request;
    }
}
