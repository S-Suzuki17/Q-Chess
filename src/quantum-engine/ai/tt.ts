export interface TTEntry {
    visits: number;
    totalValue: number;
}

export class TranspositionTable {
    private table: Map<string, TTEntry>;
    private lookups: number = 0;
    private hits: number = 0;
    private misses: number = 0;

    constructor() {
        this.table = new Map();
    }

    get(hash: string): TTEntry | undefined {
        this.lookups++;
        const entry = this.table.get(hash);
        if (entry) {
            this.hits++;
        } else {
            this.misses++;
        }
        return entry;
    }

    record(hash: string, value: number) {
        let entry = this.table.get(hash);
        if (!entry) {
            entry = { visits: 0, totalValue: 0 };
            this.table.set(hash, entry);
        }
        entry.visits++;
        entry.totalValue += value;
    }

    getStats() {
        return {
            lookupCount: this.lookups,
            hitCount: this.hits,
            missCount: this.misses,
            hitRate: this.lookups > 0 ? this.hits / this.lookups : 0,
            tableSize: this.table.size
        };
    }
    
    clear() {
        this.table.clear();
        this.lookups = 0;
        this.hits = 0;
        this.misses = 0;
    }
}
