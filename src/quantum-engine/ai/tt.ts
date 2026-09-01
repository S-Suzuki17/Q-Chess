export interface TTEntry {
    visits: number;
    totalValue: number;
}

export class TranspositionTable {
    private table: Map<string, TTEntry>;

    constructor() {
        this.table = new Map();
    }

    get(hash: string): TTEntry | undefined {
        return this.table.get(hash);
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

    getHits(): number {
        return this.table.size;
    }
    
    clear() {
        this.table.clear();
    }
}
