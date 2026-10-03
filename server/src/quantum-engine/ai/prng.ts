// Simple deterministic PRNG (Mulberry32)
export class PRNG {
    private a: number;
    constructor(seed: number) {
        this.a = seed;
    }
    next(): number {
        var t = this.a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}
